import * as THREE from "three";
import { MathUtils } from "three";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";
import { loadGLTF, loadFBX, loadOBJ } from "./loader.js";
import { preloadSoundAssets, playSoundLoopForDuration, loadAndPlaySound, playBackgroundMusic, setBGMVolume } from "./sound.js";

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
    placedOn: THREE.Object3D | null,
    placeOffset: THREE.Vector3
};
type InteractableUserData = 
{
    interactInfo: string,
    onInteract: (obj: THREE.Object3D) => void;
};
type GameObjectData =
{
    typeId: string,
    placeableData: PlaceableUserData | null,
    selectableData: SelectedUserData | null,
    interactableData: InteractableUserData | null
};
type RecipeData = 
{
    ingredients: IngredientData[],
    output: OutputRecipeData[],
    successSoundPath: string
}
type IngredientData = 
{
    typeId: string,
    minimumCount: number,
    useCount: number
}
type OutputRecipeData =
{
    obj: (interactable: THREE.Object3D) => Promise<THREE.Object3D>,
    placeOffset: THREE.Vector3
}

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
let recipes: RecipeData[] = []; 

let debugDiv: HTMLDivElement;
let handCursorDiv: HTMLDivElement;
let interactionPromptDiv: HTMLDivElement;
let lockPromptDiv: HTMLDivElement;
let crosshairDiv: HTMLDivElement;
let bgmStarted = false;
let isBGMMuted = false;
let failedSoundPath = './sounds/invalid-combination.mp3'

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

    const ambientLight = new THREE.AmbientLight(0x888888);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
    directionalLight.position.set(0, 10, 0);
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
    setupMusicUI();

    await setupKitchen();
    await preloadSoundAssets();

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

     crosshairDiv = document.createElement('div');
    crosshairDiv.id = 'crosshair';
    crosshairDiv.style.cssText = `
        position: absolute;
        top: 50%;
        left: 50%;
        width: 6px; 
        height: 6px;
        background-color: white;
        border-radius: 50%;
        transform: translate(-50%, -50%);
        pointer-events: none;
        user-select: none;
        z-index: 1000;
        box-shadow: 0 0 2px rgba(0, 0, 0, 0.5); /* Supaya terlihat di background putih */
    `;

    document.body.appendChild(crosshairDiv);
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
        crosshairDiv.style.display = show ? 'none' : 'block';
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
    const table = await loadGLTF("meja.glb");
    table.scale.setScalar(1);
    table.position.set(0.0, 0.85, 0.0);
    scene.add(table);

    const daging = await loadFBX("daging-kecil-banyak.fbx");
    daging.scale.setScalar(0.002);
    daging.position.set(-0.20, 0, -0.20);
    scene.add(daging);
    makeDraggable(daging, new THREE.Vector3(0, -0.125, 0), "daging-kecil");
    
    const ayamfilet = await loadGLTF("source/ayamfilet.glb");
    ayamfilet.scale.setScalar(0.6);
    ayamfilet.position.set(-0.20, 0, -0.20);
    scene.add(ayamfilet);
    makeDraggable(ayamfilet, new THREE.Vector3(0, 0.1, 0), "ayam-filet");

    const ayamdadu = await loadGLTF("source/ayamdadu.glb");
    ayamdadu.scale.setScalar(0.5);
    ayamdadu.position.set(-0.20, 0, -0.20);
    scene.add(ayamdadu);
    makeDraggable(ayamdadu, new THREE.Vector3(), "ayam-dadu");

    const knife = await loadGLTF("pisau.glb");
    knife.scale.setScalar(1);
    knife.position.set(0.20, 0, -0.20);
    knife.rotateX(MathUtils.degToRad(90.0));
    knife.rotateZ(MathUtils.degToRad(30.0));
    scene.add(knife);
    makeDraggable(knife, new THREE.Vector3(0, 0.085), "pisau");

    const plate = await loadGLTF("piring.glb");
    const plateSingle = plate;
    plateSingle.scale.setScalar(1);
    plateSingle.position.set(-0.20, 0, 0.50);
    scene.add(plateSingle);
    makeDraggable(plateSingle, new THREE.Vector3(0, 0.05), "piring");
    makePlacable(plateSingle, {
        placeOffset: new THREE.Vector3(0.0, 0, 0.0)
    })

    const lettuce = await loadGLTF("source/kubis.glb");
    lettuce.scale.setScalar(0.03);
    lettuce.position.set(0.30, 0, 0.60);
    scene.add(lettuce);
    makeDraggable(lettuce, new THREE.Vector3(), "kubis");

    const lettuce_cuts = await loadGLTF("source/kubis-potong.glb");
    lettuce_cuts.scale.setScalar(0.03);
    lettuce_cuts.position.set(0.10, 0, 0.40);
    scene.add(lettuce_cuts);
    makeDraggable(lettuce_cuts, new THREE.Vector3(), "kubis-potong");

    const talenan = await loadGLTF("talenan.glb");
    talenan.scale.setScalar(1);
    talenan.position.set(0.5, 0, 0.25);
    scene.add(talenan);

    makeDraggable(talenan, new THREE.Vector3(0.0, 0.015), "talenan");
    makePlacable(talenan, {
        placeOffset: new THREE.Vector3()
    });
    makeInteractable(talenan, {
        interactInfo: "interact with Talenan",
        onInteract: async (obj) =>
        {
            await runRecipeLogic(obj);
        }
    })

    makePlacable(table, {
        placeOffset: new THREE.Vector3(0.0, 0.0225, 0.0),
    }, "meja");

    addObjOnPlaceableObject(table, knife);
    addObjOnPlaceableObject(table, plateSingle);
    addObjOnPlaceableObject(table, ayamfilet);
    addObjOnPlaceableObject(table, ayamdadu);
    addObjOnPlaceableObject(table, daging);
    addObjOnPlaceableObject(table, talenan);
    addObjOnPlaceableObject(table, lettuce);
    addObjOnPlaceableObject(table, lettuce_cuts);

    setupRecipe();
}

async function setupRecipe()
{
    recipes.push({
        ingredients: [
            {
                typeId: 'ayam-filet',
                minimumCount: 1,
                useCount: 0
            },
            {
                typeId: 'pisau',
                minimumCount: 1,
                useCount: 0
            }
        ],
        output: [
            {
                async obj(interactable) {
                    const ayamdadu = await loadGLTF("source/ayamdadu.glb");
                    ayamdadu.scale.setScalar(0.5);
                    scene.add(ayamdadu);
                    makeDraggable(ayamdadu, new THREE.Vector3(), "ayam-dadu");

                    return ayamdadu
                },
                placeOffset: new THREE.Vector3(0, 0, 0)
            }
        ],
        successSoundPath: './sounds/chop.mp3'
    },

    {
        ingredients: [
            {
                typeId: 'kubis',
                minimumCount: 1,
                useCount: 0
            },
            {
                typeId: 'pisau',
                minimumCount: 1,
                useCount: 0
            }
        ],
        output: [
            {
                async obj(interactable) {
                    const lettuce_cuts = await loadGLTF("source/kubis-potong.glb");
                    lettuce_cuts.scale.setScalar(0.03);
                    lettuce_cuts.position.set(0.10, 0, 0.40);
                    scene.add(lettuce_cuts);
                    makeDraggable(lettuce_cuts, new THREE.Vector3(), "kubis-potong");

                    return lettuce_cuts
                },
                placeOffset: new THREE.Vector3(0, 0, 0)
            }
        ],
        successSoundPath: './sounds/chop.mp3'
    }
    );
}

async function runRecipeLogic(obj: THREE.Object3D)
{
    const gameObjData: GameObjectData = obj.userData as GameObjectData;
    const placeableData: PlaceableUserData = gameObjData.placeableData!!;

    const objectsInPlace = new Map();
    for(let i = 0; i < placeableData.placedObject.length; i++)
    {
        const otherGameObj: GameObjectData = placeableData.placedObject[i].userData as GameObjectData;

        const count : number | undefined = objectsInPlace.get(otherGameObj.typeId);
        if(count === undefined)
        {
            objectsInPlace.set(otherGameObj.typeId, 1);
        }
        else
        {
            objectsInPlace.set(otherGameObj.typeId, count + 1);
        }
    }

    let successRecipe: RecipeData | undefined = undefined;

    for(let i = 0; i < recipes.length; i++)
    {
        const recipe: RecipeData = recipes[i];

        if(recipe.ingredients.length != objectsInPlace.size)
        {
            continue;
        }

        let invalid: boolean = false;
        for(let j = 0; j < recipe.ingredients.length; j++)
        {
            const ingredientNum = objectsInPlace.get(recipe.ingredients[j].typeId);

            if(ingredientNum === undefined)
            {
                invalid = true;
                break;
            }
            if(ingredientNum < recipe.ingredients[j].minimumCount)
            {
                invalid = true;
                break;
            }
        }

        if(!invalid)
        {
            successRecipe = recipe;
            
            for(let j = 0; j < recipe.ingredients.length; j++)
            {
                const ingredient = recipe.ingredients[j];

                for(let k = 0; k < ingredient.useCount; k++)
                {
                    for(let a = 0; a < placeableData.placedObject.length; a++)
                    {
                        const otherGameObj: GameObjectData = placeableData.placedObject[a].userData as GameObjectData;

                        if(otherGameObj.typeId == ingredient.typeId)
                        {
                            scene.remove(placeableData.placedObject[a]);
                            removeObjOnPlaceableObject(placeableData.placedObject[a]);
                            break;
                        }
                    }
                }
            }
            for(let j = 0; j < recipe.output.length; j++)
            {
                const spawnedObj = await recipe.output[j].obj(obj);
                const spawnPos = obj.position.clone();
                const spawnOffset = recipe.output[j].placeOffset;
                spawnPos.add(spawnOffset);
                spawnPos.add(placeableData.placeOffset);
                
                spawnedObj.position.set(spawnPos.x, spawnPos.y, spawnPos.z);
                addObjOnPlaceableObject(obj, spawnedObj);
            }

            break;
        }
    }

    if(successRecipe)
    {
        if (successRecipe.successSoundPath && successRecipe.successSoundPath !== '') {
            loadAndPlaySound(successRecipe.successSoundPath, 0.8); 
        }
    }
    else
    {
        loadAndPlaySound(failedSoundPath, 0.6);
    }
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
        selectedGoPosition.add(selectedObject.userData.selectableData.placeOffset);

        raycaster.set(camera.position, cameraDirection);
        const placeableIntersects = raycaster.intersectObjects(placeableObjects, true);

        const ignoreId = getAllChildsSet(selectedObject);

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
            if(ignoreId.has(chooseObj.id))
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
            selectedGoPosition.add(selectedObject.userData.selectableData.placeOffset);
        }

        selectedObject?.position.set(selectedGoPosition.x, selectedGoPosition.y, selectedGoPosition.z);

        recursiveUpdatePlaceableObject(selectedObject);
    }
}

function getAllChildsSet(obj: THREE.Object3D) : Set<number>
{
    const set = new Set<number>();
    const gameObj : GameObjectData = obj.userData as GameObjectData;

    if(gameObj.placeableData)
    {
        const placeData = gameObj.placeableData;

        for(let i = 0; i < placeData.placedObject.length; i++)
        {
            const childSet = getAllChildsSet(placeData.placedObject[i]);
            set.add(placeData.placedObject[i].id);

            for(const id of childSet)
            {
                set.add(id);
            }
        }
    }

    return set;
}

function addObjOnPlaceableObject(placeableObj: THREE.Object3D, obj: THREE.Object3D)
{
    let selectedData: SelectedUserData = obj.userData.selectableData as SelectedUserData;
    if(selectedData.placedOn)
    {
        throw new Error("Cannot place object on another one again!");
    }

    let newPlacedOnData : PlaceableUserData = placeableObj.userData.placeableData as PlaceableUserData;

    const placePos : THREE.Vector3 = obj.position.clone();
    placePos.set(placePos.x, placeableObj.position.y, placePos.z);
    placePos.add(selectedData.placeOffset);
    placePos.add(newPlacedOnData.placeOffset);

    obj.position.set(placePos.x, placePos.y, placePos.z);

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

function makeDraggable(obj: THREE.Object3D, offsetPlace: THREE.Vector3 = new THREE.Vector3(0, 0, 0), newTypeId: string | undefined = undefined) {
    draggableObjects.push(obj);

    let gameObj = asGameObject(obj.userData);
    if(!gameObj)
    {
        if(!newTypeId)
        {
            throw new Error("New registered gameObj must have newTypeData not be undefined")
        }

        gameObj = {
            typeId: newTypeId,
            placeableData: null,
            selectableData: null,
            interactableData: null
        };
    }
    gameObj.selectableData = {
        placedOn: null,
        placeOffset: offsetPlace
    };

    obj.userData = gameObj;
}

function makePlacable(obj: THREE.Object3D, data: AddPlaceableUserData, newTypeId: string | undefined = undefined)
{
    placeableObjects.push(obj);
    let gameObj = asGameObject(obj.userData);
    if(!gameObj)
    {
        if(!newTypeId)
        {
            throw new Error("New registered gameObj must have newTypeData not be undefined")
        }

        gameObj = {
            typeId: newTypeId,
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

function makeInteractable(obj: THREE.Object3D, data: InteractableUserData, newTypeId: string | undefined = undefined)
{
    interactableObjects.push(obj);

    let gameObj = asGameObject(obj.userData);
    if(!gameObj)
    {
        if(!newTypeId)
        {
            throw new Error("New registered gameObj must have newTypeData not be undefined")
        }

        gameObj = {
            typeId: newTypeId,
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
            playBGM();
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

async function playBGM() {
    if (!bgmStarted) {
        await playBackgroundMusic('./sounds/testsound.mp3');  
        setBGMVolume(0.2);
        bgmStarted = true; 
    }
}

function setupMusicUI() {
    const container = document.createElement('div');
    container.style.cssText = `
        position: absolute;
        bottom: 20px;
        right: 20px;
        z-index: 2000;
        user-select: none;
    `;

    const iconSoundOn = `
        <svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 -960 960 960" width="18" fill="#ffffff">
            <path d="M560-131v-82q90-26 145-100t55-168q0-94-55-168T560-749v-82q124 28 202 125.5T840-481q0 127-78 224.5T560-131ZM120-360v-240h160l200-200v640L280-360H120Zm440 40v-322q47 22 73.5 66t26.5 96q0 51-26.5 94.5T560-320Z"/>
        </svg>`;

    const iconSoundOff = `
        <svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 -960 960 960" width="18" fill="#ffffff">
            <path d="M792-56 671-177q-25 16-53 27.5T560-131v-82q14-5 27.5-10t25.5-12L480-368v208L280-360H120v-240h128L56-792l56-56 736 736-56 56Zm-8-232-58-58q17-31 25.5-65t8.5-70q0-94-55-168T560-749v-82q124 28 202 125.5T840-481q0 53-14.5 102T784-288ZM650-422l-90-90v-130q47 22 73.5 66t26.5 96q0 15-2.5 29.5T650-422ZM480-592 280-392l-58-58 258-258v116Z"/>
        </svg>`;

    const btn = document.createElement('div');
    btn.innerHTML = iconSoundOn; 
    btn.style.cssText = `
        width: 30px;
        height: 30px;
        background-color: #6b6359; /* Warna Coklat sesuai referensi */
        border-radius: 50%;
        display: flex;
        justify-content: center;
        align-items: center;
        cursor: pointer;
        box-shadow: 0 4px 6px rgba(0,0,0,0.3);
        border: 2px solid rgba(255,255,255,0.2);
        transition: transform 0.1s, background-color 0.2s;
    `;

    btn.addEventListener('click', async () => {
        if (!bgmStarted) {
            await playBGM(); 
            isBGMMuted = false;
            btn.innerHTML = iconSoundOn;
            return;
        }

        if (isBGMMuted) {
            setBGMVolume(0.2);
            btn.innerHTML = iconSoundOn;
            isBGMMuted = false;
        } else {
            setBGMVolume(0); 
            btn.innerHTML = iconSoundOff;
            isBGMMuted = true;
        }
    });

    container.appendChild(btn);
    document.body.appendChild(container);
}

init();