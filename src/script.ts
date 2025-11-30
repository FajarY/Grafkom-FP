import * as THREE from "three";
import { MathUtils } from "three";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";
import { loadGLTF, loadFBX, loadOBJ } from "./loader.js";

type PlaceableUserData =
{
    placeOffset: THREE.Vector3,
    placedObject: THREE.Object3D[],
    lastPlaceObjectPos: THREE.Vector3[]
};
type AddPlaceableUserData =
{
    placeOffset: THREE.Vector3
};
type SelectedUserData =
{
    placedOn: THREE.Object3D | null;
};
type InteractableUserData = 
{
    interactInfo: string,
    onInteract: (obj: THREE.Object3D) => void;
};
type GameObjectData =
{
    placeableData: PlaceableUserData | null,
    selectableData: SelectedUserData | null,
    interactableData: InteractableUserData | null
};

const controls = {
    moveForward: false,
    moveBackward: false,
    moveLeft: false,
    moveRight: false,
    moveUp: false,
    moveDown: false,
};

let clock: THREE.Clock;

const speed = 0.005;

let deltaTime: number;
let accumulatedTime: number = 0.0;
let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let renderer: THREE.WebGLRenderer;
let pointerLockControls: PointerLockControls;

const raycaster = new THREE.Raycaster();
const draggableObjects: THREE.Object3D[] = [];
const placeableObjects: THREE.Object3D[] = [];
const interactableObjects: THREE.Object3D[] = [];
let selectedObject: THREE.Object3D | null = null;
let currentPlaceableObject: THREE.Object3D | null = null;
let selectedObjectLastPosition: THREE.Vector3;
let selectedObjectLastQuaternion: THREE.Euler;
let isMovingSelectedObject = false;
let interactingObject: THREE.Object3D | null = null;

let debugDiv: HTMLDivElement;
let handCursorDiv: HTMLDivElement;
let interactionPromptDiv: HTMLDivElement;
let lockPromptDiv: HTMLDivElement;

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
    
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("resize", onWindowResize);
    
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("pointerup", onPointerUp);

    setupUI();

    await setupKitchen();

    animate();
}

function setupUI() {
    debugDiv = document.createElement('div');

    debugDiv.style.cssText = `
        position: absolute;
        top: 10px;
        right: 10px;
        background-color: rgba(0, 0, 0, 0.5);
        color: #00ff00;
        font-family: monospace;
        font-size: 14px;
        padding: 10px;
        pointer-events: none;
        user-select: none;
        white-space: pre;
        z-index: 1000;
        min-width: 200px;
    `;
    document.body.appendChild(debugDiv);

    handCursorDiv = document.createElement('div');
    handCursorDiv.id = 'hand-cursor';

    handCursorDiv.style.cssText = `
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 48px; /* Example size */
        height: 48px; /* Example size */
        background-image: url('hand_icon.svg');
        background-size: contain;
        background-repeat: no-repeat;
        background-position: center;
        z-index: 1001; /* Must be above the debug UI */
        display: none; /* Initially hidden */
    `;

    document.body.appendChild(handCursorDiv);

    interactionPromptDiv = document.createElement('div');
    interactionPromptDiv.id = 'interaction-prompt';
    interactionPromptDiv.innerText = "";

    interactionPromptDiv.style.cssText = `
        position: absolute;
        bottom: 50px;
        left: 50%;
        transform: translateX(-50%);
        background-color: rgba(0, 0, 0, 0.6);
        color: white;
        font-family: Arial, sans-serif;
        font-size: 18px;
        padding: 8px 15px;
        border-radius: 5px;
        pointer-events: none;
        user-select: none;
        z-index: 1002;
        display: None;
        letter-spacing: 1px;
    `;

    document.body.appendChild(interactionPromptDiv);

    lockPromptDiv = document.createElement('div');
    lockPromptDiv.id = 'lock-prompt';
    lockPromptDiv.innerText = "Press R to use controls";

    lockPromptDiv.style.cssText = `
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%); /* Center perfectly */
        background-color: rgba(255, 255, 255, 0.9);
        color: #111111;
        font-family: Arial, sans-serif;
        font-size: 24px;
        font-weight: bold;
        padding: 20px 30px;
        border-radius: 8px;
        box-shadow: 0 0 10px rgba(0, 0, 0, 0.5);
        pointer-events: none; /* Crucial: ensures it doesn't block the screen */
        user-select: none;
        z-index: 2000; /* Highest z-index to be clearly visible */
        display: block; /* Initially visible */
    `;

    document.body.appendChild(lockPromptDiv);
}

function updateUI() {
    if (debugDiv)
    {
        const camPos = camera.position;
        const selectedName = selectedObject ? (selectedObject.name || selectedObject.uuid.slice(0, 8)) : "None";
        const placeableName = currentPlaceableObject ? (currentPlaceableObject.name || currentPlaceableObject.uuid.slice(0, 8)) : "None";
        const interactingName = interactingObject ? (interactingObject.name || interactingObject.uuid.slice(0, 8)) : "None";

        const text = `
=== DEBUG INFO ===
FPS: ${(1 / deltaTime).toFixed(1)}
Time: ${clock.getElapsedTime().toFixed(2)}s

[ Camera ]
X: ${camPos.x.toFixed(2)}
Y: ${camPos.y.toFixed(2)}
Z: ${camPos.z.toFixed(2)}

[ Interaction ]
Dragging: ${isMovingSelectedObject}
Selected: ${selectedName}
Placeable: ${placeableName}
Interacting: ${interactingName}
    `;

        debugDiv.innerText = text.trim();
    }
    if (handCursorDiv)
    {
        let show = false;
        if(!isMovingSelectedObject)
        {
            if(selectedObject != null)
            {
                handCursorDiv.style.backgroundImage = 'url("hand_icon.svg")'
                handCursorDiv.style.width = '40px';
                handCursorDiv.style.height = '40px';
                show = true;
            }
        }
        else
        {
            if(currentPlaceableObject != null)
            {
                handCursorDiv.style.backgroundImage = 'url("correct_icon.svg")'
                handCursorDiv.style.width = '40px';
                handCursorDiv.style.height = '40px';
                show = true;
            }
            else
            {
                handCursorDiv.style.backgroundImage = 'url("no_icon.svg")'
                handCursorDiv.style.width = '30px';
                handCursorDiv.style.height = '30px';
                show = true;
            }
        }

        handCursorDiv.style.display = show ? 'block' : 'none';
    }
    if(interactionPromptDiv)
    {
        interactionPromptDiv.style.display = interactingObject ? 'block' : 'none';
        interactionPromptDiv.innerText = `Press F to ${interactingObject?.userData.interactableData.interactInfo}`;
    }
    if(lockPromptDiv)
    {
        lockPromptDiv.style.display = pointerLockControls.isLocked ? 'none' : 'block';
    }
}

async function setupKitchen()
{
    const table = await loadFBX("table.fbx");
    table.scale.setScalar(0.01);
    table.position.set(0.0, 0.5, 0.0);
    scene.add(table);

    // const daging = await loadFBX("daging.fbx");
    // daging.scale.setScalar(0.002);
    // daging.position.set(-0.20, 1.05, -0.20);
    // // daging.rotateX(MathUtils.degToRad(90.0));
    // scene.add(daging);
    // makeDraggable(daging);

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
    makePlacable(plateSingle, {
        placeOffset: new THREE.Vector3(0.0, 0.025, 0.0)
    })

    makePlacable(table, {
        placeOffset: new THREE.Vector3(0.0, 0.535, 0.0),
    });

    makeInteractable(plateSingle, {
        interactInfo: "interact with Plate",
        onInteract: (obj) =>
        {
            console.log(obj)
        }
    })

    addObjOnPlaceableObject(table, knife);
    addObjOnPlaceableObject(table, plateSingle);
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

function update()
{   
    checkRaycast();
}

function checkRaycast()
{
    const maxInteractingObjDistance = 2.0;
    const maxSelectedObjDistance = 2.0;
    const maxPlaceableObjDistance = 2.0;
    const cameraDirection = new THREE.Vector3();
    camera.getWorldDirection(cameraDirection);

    interactingObject = null;
    if(!isMovingSelectedObject)
    {
        raycaster.set(camera.position, cameraDirection);
        const draggableIntersects = raycaster.intersectObjects(draggableObjects, true);

        selectedObject = null;
        for(let i = 0; i < draggableIntersects.length; i++)
        {
            const topDraggable = draggableIntersects[0];
            const topObject = findTopDraggableAncestor(topDraggable.object);

            if(topDraggable.point.distanceTo(camera.position) > maxSelectedObjDistance)
            {
                continue;
            }

            selectedObject = topObject;
            break;
        }

        raycaster.set(camera.position, cameraDirection);
        const interactabeIntersects = raycaster.intersectObjects(interactableObjects, true);

        for(let i = 0; i < interactabeIntersects.length; i++)
        {
            const topInteractable = interactabeIntersects[0];
            const topObject = findTopInteractableAncestor(topInteractable.object);

            if(topInteractable.point.distanceTo(camera.position) > maxInteractingObjDistance)
            {
                continue;
            }

            interactingObject = topObject;
            break;
        }
    }
    else
    {
        if(!selectedObject)
        {
            throw new Error("Unknown error");
        }

        let selectedGoPosition = camera.position.clone().add(cameraDirection.multiplyScalar(1.0));

        raycaster.set(camera.position, cameraDirection);
        const placeableIntersects = raycaster.intersectObjects(placeableObjects, true);

        currentPlaceableObject = null;
        let currentIntersectIndex = 0;
        for(let i = 0; i < placeableIntersects.length; i++)
        {
            currentIntersectIndex = i;
            const currentIntersectRay = placeableIntersects[i];
            const chooseObj = findTopPlaceableAncestor(currentIntersectRay.object);

            if(currentIntersectRay.point.distanceTo(camera.position) > maxPlaceableObjDistance)
            {
                continue;
            }
            if(chooseObj.id == selectedObject?.id)
            {
                continue;
            }

            currentPlaceableObject = chooseObj;
            break;
        }

        if(currentPlaceableObject != null)
        {
            selectedGoPosition = placeableIntersects[currentIntersectIndex].point.clone();
            selectedGoPosition.y = currentPlaceableObject.position.y;

            selectedGoPosition.add(currentPlaceableObject.userData.placeableData.placeOffset);
        }

        selectedObject?.position.set(selectedGoPosition.x, selectedGoPosition.y, selectedGoPosition.z);

        recursiveUpdatePlaceableObject(selectedObject);
    }
}

function addObjOnPlaceableObject(placeableObj: THREE.Object3D, obj: THREE.Object3D)
{
    let selectedData: SelectedUserData = obj.userData.selectableData as SelectedUserData;
    if(selectedData.placedOn)
    {
        throw new Error("Cannot place object on another one again!");
    }

    let newPlacedOnData : PlaceableUserData = placeableObj.userData.placeableData as PlaceableUserData;

    newPlacedOnData.placedObject.push(obj);
    newPlacedOnData.lastPlaceObjectPos.push(obj.position.clone().sub(placeableObj.position.clone()));

    selectedData.placedOn = placeableObj;
}
function removeObjOnPlaceableObject(obj: THREE.Object3D)
{
    let selectedData: SelectedUserData = obj.userData.selectableData as SelectedUserData;

    if(!selectedData.placedOn)
    {
        return;
    }
    let lastPlaceableData: PlaceableUserData = selectedData.placedOn.userData.placeableData as PlaceableUserData;
            
    for(let i = 0; i < lastPlaceableData.placedObject.length; i++)
    {
        if(lastPlaceableData.placedObject[i].id == obj.id)
        {
            lastPlaceableData.placedObject.splice(i, 1);
            lastPlaceableData.lastPlaceObjectPos.splice(i, 1);
            break;
        }
    }

    selectedData.placedOn = null;
}

function recursiveUpdatePlaceableObject(placeableObj: THREE.Object3D)
{
    const gameObjData: GameObjectData = placeableObj.userData as GameObjectData;

    if(gameObjData.placeableData)
    {
        for(let i = 0; i < gameObjData.placeableData.placedObject.length; i++)
        {
            const obj = gameObjData.placeableData.placedObject[i];
            obj.position.copy(placeableObj.position.clone().add(gameObjData.placeableData.lastPlaceObjectPos[i]));

            recursiveUpdatePlaceableObject(obj);
        }
    }
}

function makeDraggable(obj: THREE.Object3D) {
    draggableObjects.push(obj);

    let gameObj = asGameObject(obj.userData);
    if(!gameObj)
    {
        gameObj = {
            placeableData: null,
            selectableData: null,
            interactableData: null
        };
    }
    gameObj.selectableData = {
        placedOn: null
    };

    obj.userData = gameObj;
}

function makePlacable(obj: THREE.Object3D, data: AddPlaceableUserData)
{
    placeableObjects.push(obj);
    let gameObj = asGameObject(obj.userData);
    if(!gameObj)
    {
        gameObj = {
            placeableData: null,
            selectableData: null,
            interactableData: null
        };
    }

    gameObj.placeableData = {
        lastPlaceObjectPos : [],
        placedObject: [],
        ...data
    }

    obj.userData = gameObj;
}

function makeInteractable(obj: THREE.Object3D, data: InteractableUserData)
{
    interactableObjects.push(obj);

    let gameObj = asGameObject(obj.userData);
    if(!gameObj)
    {
        gameObj = {
            placeableData: null,
            selectableData: null,
            interactableData: null
        };
    }
    gameObj.interactableData = data;

    obj.userData = gameObj;
}

function findTopInteractableAncestor(obj: THREE.Object3D): THREE.Object3D {
    let current: THREE.Object3D | null = obj;
    while (current) {
        if (interactableObjects.includes(current)) return current;
        current = current.parent;
    }
    return obj;
}
function findTopDraggableAncestor(obj: THREE.Object3D): THREE.Object3D {
    let current: THREE.Object3D | null = obj;
    while (current) {
        if (draggableObjects.includes(current)) return current;
        current = current.parent;
    }
    return obj;
}
function findTopPlaceableAncestor(obj: THREE.Object3D): THREE.Object3D {
    let current: THREE.Object3D | null = obj;
    while (current) {
        if (placeableObjects.includes(current)) return current;
        current = current.parent;
    }
    return obj;
}

function onPointerDown(event: PointerEvent) {
    if (!pointerLockControls.isLocked) return;
    if (event.button !== 0) return;

    if(selectedObject === null)
    {
        return;
    }
    isMovingSelectedObject = true;

    selectedObjectLastPosition = selectedObject.position.clone();
    selectedObjectLastQuaternion = selectedObject.rotation.clone();
}

function onPointerUp(event: PointerEvent) {
    if(isMovingSelectedObject)
    {
        if (event.button !== 0) return;
        if(!selectedObject) return;
        isMovingSelectedObject = false;

        if(currentPlaceableObject == null)
        {
            selectedObject.position.copy(selectedObjectLastPosition);
            selectedObject.rotation.copy(selectedObjectLastQuaternion);

            recursiveUpdatePlaceableObject(selectedObject); 
        }
        else
        {
            removeObjOnPlaceableObject(selectedObject);
            addObjOnPlaceableObject(currentPlaceableObject, selectedObject);
        }

        currentPlaceableObject = null;
    }
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
        case "KeyR":
            pointerLockControls.lock();
            break;
        case "KeyF":
            if(interactingObject)
            {
                let interactingData: InteractableUserData = interactingObject.userData.interactableData as InteractableUserData;
                
                interactingData.onInteract(interactingObject);
            }
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
    update();
    updateUI();

    renderer.render(scene, camera);
    requestAnimationFrame(animate);
}

function asGameObject(data: any): GameObjectData | null
{
    if (typeof data !== 'object' || data === null) {
        return null;
    }

    const hasRequiredKeys = 
        'placeableData' in data && 
        'selectableData' in data &&
        'interactableData' in data;

    if (!hasRequiredKeys) {
        return null;
    }

    return data as GameObjectData;
}

init();