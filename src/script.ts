import * as THREE from "three";
import { MathUtils } from "three";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";
import { loadGLTF, loadFBX, loadOBJ } from "./loader.js";

const controls = {
    moveForward: false,
    moveBackward: false,
    moveLeft: false,
    moveRight: false,
    moveUp: false,
    moveDown: false,
};

let clock: THREE.Clock;

const speed = 0.025;

let deltaTime: number;
let accumulatedTime: number = 0.0;
let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let renderer: THREE.WebGLRenderer;
let pointerLockControls: PointerLockControls;

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const draggableObjects: THREE.Object3D[] = [];
let selectedObject: THREE.Object3D | null = null;
const dragOffset = new THREE.Vector3();
const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
let isPointerDownForDrag = false;

async function init() {
    clock = new THREE.Clock();
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x3cb0fa);

    const fov = 75;
    const aspect = window.innerWidth / window.innerHeight;
    const near = 0.1;
    const far = 1000;

    camera = new THREE.PerspectiveCamera(fov, aspect, near, far);
    camera.position.set(1.5, 1.5, 1.5);
    camera.lookAt(new THREE.Vector3(0, 0, 0));

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    const ambientLight = new THREE.AmbientLight(0x404040);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
    directionalLight.position.set(5, 5, 5);
    scene.add(directionalLight);

    addHelperGrid();

    pointerLockControls = new PointerLockControls(camera, document.body);
    scene.add(pointerLockControls.object);

    document.body.addEventListener("pointerdown", (event) => {
        if (event.button === 2) {
            pointerLockControls.lock();
        }
    });
    document.body.addEventListener("pointerup", (event) => {
        if (event.button === 2) {
            pointerLockControls.unlock();
        }
    });
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("resize", onWindowResize);

    // Right click locks/unlocks pointer (keep your existing behavior)
    document.body.addEventListener("pointerdown", (event) => {
        if (event.button === 2) {
            pointerLockControls.lock();
        }
    });
    document.body.addEventListener("pointerup", (event) => {
        if (event.button === 2) {
            pointerLockControls.unlock();
        }
    });

    // Add left-click drag handlers (only when pointer NOT locked)
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);

    await setupKitchen();

    animate();
}

async function setupKitchen()
{
    const table = await loadFBX("table.fbx");
    table.scale.setScalar(0.01);
    table.position.set(0.0, 0.5, 0.0);
    scene.add(table);

    const knife = await loadGLTF("source/knife2.glb");
    knife.scale.setScalar(0.25);
    knife.position.set(0.20, 1.05, -0.20);
    knife.rotateX(MathUtils.degToRad(90.0));
    knife.rotateZ(MathUtils.degToRad(30.0));
    scene.add(knife);
    makeDraggable(knife);

    const plate = await loadGLTF("ceramic_plate_set.glb");
    const plateSingle = plate.children[0].children[0].children[0].children[1];
    plateSingle.scale.setScalar(2);
    plateSingle.position.set(-0.20, 1.05, 0.50);
    scene.add(plateSingle);
    makeDraggable(plateSingle);
}

function addHelperGrid() {
    const size = 300;
    const divisions = 300;
    const colorGrid = 0x888888;

    const gridXZ = new THREE.GridHelper(size, divisions, colorGrid, colorGrid);
    (gridXZ.material as THREE.Material).opacity = 0.3;
    (gridXZ.material as THREE.Material).transparent = true;
    scene.add(gridXZ);

    const groundGeometry = new THREE.PlaneGeometry(size, size);
    const groundMaterial = new THREE.MeshStandardMaterial({
        color: 0x3a9d3a,
        side: THREE.DoubleSide,
    });
    const groundPlane = new THREE.Mesh(groundGeometry, groundMaterial);
    groundPlane.rotation.x = Math.PI / 2;
    groundPlane.position.y = -0.01;
    scene.add(groundPlane);
}


/* mark object as draggable (call after object is added to scene) */
function makeDraggable(obj: THREE.Object3D) {
    draggableObjects.push(obj);
}

/* ---------- Drag event handlers ---------- */
function getMouseNDCCoords(event: PointerEvent) {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
}

function findTopDraggableAncestor(obj: THREE.Object3D): THREE.Object3D {
    // climb parents until we find an object that is directly in draggableObjects
    let current: THREE.Object3D | null = obj;
    while (current) {
        if (draggableObjects.includes(current)) return current;
        current = current.parent;
    }
    return obj;
}

function onPointerDown(event: PointerEvent) {
    // only allow dragging with left button and when pointer is NOT locked
    if (pointerLockControls.isLocked) return;
    if (event.button !== 0) return;

    isPointerDownForDrag = true;
    getMouseNDCCoords(event);
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(draggableObjects, true);
    console.log(intersects);

    if (intersects.length > 0) {
        const topIntersect = intersects[0];
        const topObject = findTopDraggableAncestor(topIntersect.object);
        selectedObject = topObject;

        // set a drag plane at the object's current world Y position
        // plane equation: normal (0,1,0), constant = -y
        const worldPos = new THREE.Vector3();
        selectedObject.getWorldPosition(worldPos);
        dragPlane.set(new THREE.Vector3(0, 1, 0), -worldPos.y);

        // compute offset: intersection point on plane - object's world position
        const intersectionPoint = new THREE.Vector3();
        raycaster.ray.intersectPlane(dragPlane, intersectionPoint);
        dragOffset.copy(intersectionPoint).sub(worldPos);

        document.body.style.cursor = "grabbing";
    }
}

function onPointerMove(event: PointerEvent) {
    if (!isPointerDownForDrag || !selectedObject) return;
    getMouseNDCCoords(event);
    raycaster.setFromCamera(mouse, camera);

    const intersectionPoint = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(dragPlane, intersectionPoint)) {
        // compute new world position (intersection - offset)
        const newWorldPos = intersectionPoint.clone().sub(dragOffset);

        // If selectedObject has parent transforms, convert world position to parent's local space
        if (selectedObject.parent) {
            const parentInv = new THREE.Matrix4().copy(selectedObject.parent.matrixWorld).invert();
            newWorldPos.applyMatrix4(parentInv);
        }
        // only change X and Z to keep height stable
        selectedObject.position.x = newWorldPos.x;
        selectedObject.position.z = newWorldPos.z;
    }
}

function onPointerUp(event: PointerEvent) {
    if (event.button !== 0) return;
    isPointerDownForDrag = false;
    selectedObject = null;
    document.body.style.cursor = "auto";
}

function handleKeyDown(event: KeyboardEvent) {
    switch (event.code) {
        case "KeyW":
            controls.moveForward = true;
            break;
        case "KeyS":
            controls.moveBackward = true;
            break;
        case "KeyA":
            controls.moveLeft = true;
            break;
        case "KeyD":
            controls.moveRight = true;
            break;
        case "Space":
            controls.moveUp = true;
            break;
        case "ShiftLeft":
            controls.moveDown = true;
            break;
    }
}

function handleKeyUp(event: KeyboardEvent) {
    switch (event.code) {
        case "KeyW":
            controls.moveForward = false;
            break;
        case "KeyS":
            controls.moveBackward = false;
            break;
        case "KeyA":
            controls.moveLeft = false;
            break;
        case "KeyD":
            controls.moveRight = false;
            break;
        case "Space":
            controls.moveUp = false;
            break;
        case "ShiftLeft":
            controls.moveDown = false;
            break;
    }
}

function lockCameraZeroMovement() {
    if (pointerLockControls.isLocked) {
        if (controls.moveForward) {
            pointerLockControls.moveForward(speed);
        }
        if (controls.moveBackward) {
            pointerLockControls.moveForward(-speed);
        }
        if (controls.moveLeft) {
            pointerLockControls.moveRight(-speed);
        }
        if (controls.moveRight) {
            pointerLockControls.moveRight(speed);
        }
        if (controls.moveUp) {
            camera.position.y += speed;
        }
        if (controls.moveDown) {
            camera.position.y -= speed;
        }
    }
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    deltaTime = clock.getDelta();

    lockCameraZeroMovement();

    renderer.render(scene, camera);
    requestAnimationFrame(animate);
}

function appendFloat32(current: Float32Array, add: Float32Array) {
    var newArr = new Float32Array(current.length + add.length);
    newArr.set(current, 0);
    newArr.set(add, current.length);

    return newArr;
}
function appendObj(
    obj1: { verts: Float32Array; indexes: number[] },
    obj2: { verts: Float32Array; indexes: number[] }
) {
    const verts = appendFloat32(obj1.verts, obj2.verts);
    const indexes: number[] = [];
    for (let i = 0; i < obj1.indexes.length; i++) {
        indexes.push(obj1.indexes[i]);
    }
    for (let i = 0; i < obj2.indexes.length; i++) {
        indexes.push(obj2.indexes[i]);
    }

    return {
        verts,
        indexes,
    };
}

init();