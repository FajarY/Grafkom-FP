import * as THREE from "three";
import { MathUtils } from "three";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";

const controls = {
    moveForward: false,
    moveBackward: false,
    moveLeft: false,
    moveRight: false,
    moveUp: false,
    moveDown: false,
};

let clock: THREE.Clock;

const speed = 0.05;

let deltaTime: number;
let accumulatedTime: number = 0.0;
let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let renderer: THREE.WebGLRenderer;
let pointerLockControls: PointerLockControls;

function init() {
    clock = new THREE.Clock();
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x3cb0fa);

    const fov = 75;
    const aspect = window.innerWidth / window.innerHeight;
    const near = 0.1;
    const far = 1000;

    camera = new THREE.PerspectiveCamera(fov, aspect, near, far);
    camera.position.set(0.0, 6.0, 10.0);
    camera.lookAt(new THREE.Vector3(-5, 5, 0));

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
animate();