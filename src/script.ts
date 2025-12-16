import * as THREE from "three";
import { MathUtils } from "three";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";
import { Sky } from "three/addons/objects/Sky.js";
import { loadModel, loadModelsFromPathsCache } from "./loader.js";
import { preloadSoundAssets, SoundControl, loadAndPlaySound, playBackgroundMusic, setBGMVolume } from "./sound.js";
import RenderList from "three/src/renderers/common/RenderList.js";

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
    interactInfo: (obj: THREE.Object3D) => string | undefined,
    onInteract: (obj: THREE.Object3D) => void;
};
type FoodUserData =
{
    cookingData: any,
    isCanContinueCooking: (obj: THREE.Object3D, foodData: FoodUserData) => boolean
    updateCooking: (obj: THREE.Object3D, foodData: FoodUserData) => void;
};
type GameObjectData =
{
    typeId: string,
    displayName: string,
    placeableData: PlaceableUserData | null,
    selectableData: SelectedUserData | null,
    interactableData: InteractableUserData | null,
    foodData: FoodUserData | null
};
type SoundData = 
{
    path: string,
    volume: number,
    fadeIn: number,
    fadeOut: number,
    startTime: number,
    loop: boolean,
    control: SoundControl | null,
}
type RecipeData = 
{
    ingredients: IngredientData[],
    output: OutputRecipeData[],
    aditionalChecker?: (recipe: RecipeData, objectsIn: THREE.Object3D[]) => boolean;
    successSound: SoundData
}
type IngredientData = 
{
    typeId: string,
    minimumCount: number,
    useCount: number
}
type OutputRecipeData =
{
    obj: (interactable: THREE.Object3D) => THREE.Object3D,
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

const enableShadow: boolean = true;
const speed = 1;

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
let hoverLabelDiv: HTMLDivElement;
let hoveredObject: THREE.Object3D | null = null;
let bgmStarted = false;
let isBGMMuted = false;
let failedSoundPath = './sounds/invalid-combination.mp3'

let recipeDiv: HTMLDivElement;
let isRecipeOpen: boolean = false;

let loadingScreenDiv: HTMLDivElement;
let progressBarContainer: HTMLDivElement;
let progressBarFill: HTMLDivElement;
let loadingTextDiv: HTMLDivElement;

let table: THREE.Object3D;
let secondTable: THREE.Object3D;
let komporGlobal: THREE.Object3D;
let komporApiGlobal: THREE.Object3D;
let isKomporActive: boolean = false;
let wajanPreferableOnKompor: THREE.Vector3;
let wajan: THREE.Object3D;
let komporLiquid: THREE.Object3D;
let komporLiquidSolid: THREE.Object3D;
let liquidCookTime: number;
let liquidType: string;
let liquidColorMultiplier: THREE.Color = new THREE.Color(1, 1, 1);

let gasSoundControl: SoundControl | null = null;
let fryingSoundControl: SoundControl | null = null;
let boilingSoundControl: SoundControl | null = null;
let directionalLight: THREE.DirectionalLight;

async function init() {
    clock = new THREE.Clock();
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x3cb0fa);
    liquidType = "";

    const fov = 75;
    const aspect = window.innerWidth / window.innerHeight;
    const near = 0.1;
    const far = 1000;

    camera = new THREE.PerspectiveCamera(fov, aspect, near, far);
    camera.position.set(1.0, 1.5, 1.5);
    camera.lookAt(new THREE.Vector3(0, 0, 0));

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.body.appendChild(renderer.domElement);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.75);
    scene.add(ambientLight);

    directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
    directionalLight.position.set(0, 10, 0);
    directionalLight.castShadow = enableShadow;
    directionalLight.shadow.mapSize.width = 1024; 
    directionalLight.shadow.mapSize.height = 1024;
    directionalLight.shadow.bias = -0.000005;
    directionalLight.shadow.normalBias = 0.02;

    const d = 10; 
    directionalLight.shadow.camera.left = -d;
    directionalLight.shadow.camera.right = d;
    directionalLight.shadow.camera.top = d;
    directionalLight.shadow.camera.bottom = -d;

    scene.add(directionalLight);
    scene.add(directionalLight.target);

    

    

    addHelperGrid();

    pointerLockControls = new PointerLockControls(camera, document.body);
    scene.add(pointerLockControls.object);
    
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("resize", onWindowResize);
    
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("pointerup", onPointerUp);
    
    setupLoadingUI();
    setupUI();
    setupMusicUI();

    THREE.DefaultLoadingManager.onProgress = function (url, itemsLoaded, itemsTotal) {
        const percent = (itemsLoaded / itemsTotal) * 100;
        progressBarFill.style.width = percent + '%';
        
        loadingTextDiv.innerText = `Loading Asset ${url}: ${Math.floor(percent)}%`;
    };

    THREE.DefaultLoadingManager.onLoad = function ( ) {
        console.log( 'Loading Complete!');
    };

    loadingTextDiv.innerText = "Loading Audio Clips...";
    await preloadSoundAssets();
    
    progressBarFill.style.width = '5%'; 
    loadingTextDiv.innerText = "Loading 3D Models...";
    
    await loadModelsFromPathsCache();

    setupSky();
    setupScenery();

    loadingTextDiv.innerText = "Ready!";
    progressBarFill.style.width = '100%';
    
    animate();
    setTimeout(() => {
        loadingScreenDiv.style.opacity = '0';
        setTimeout(() => {
            loadingScreenDiv.style.display = 'none'; 
        }, 500); 
    }, 500);
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
        display: none;
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

    hoverLabelDiv = document.createElement('div');
    hoverLabelDiv.id = 'hover-label';
    hoverLabelDiv.style.cssText = `
        position: absolute;
        bottom: 20px;
        right: 75px;
        background-color: rgba(0, 0, 0, 0.75);
        color: white;
        font-family: Arial, sans-serif;
        font-size: 16px;
        padding: 8px 16px;
        border-radius: 4px;
        pointer-events: none;
        user-select: none;
        z-index: 1999;
        display: none;
        white-space: nowrap;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    `;
    document.body.appendChild(hoverLabelDiv);

    recipeDiv = document.createElement('div');
    recipeDiv.id = 'recipe-book';
    recipeDiv.style.cssText = `
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 600px;
        max-height: 80vh;
        background-color: rgba(20, 20, 20, 0.95);
        color: #f0f0f0;
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        padding: 30px;
        border-radius: 15px;
        border: 2px solid #8b4513; /* Warna kayu/coklat */
        overflow-y: auto;
        display: none; /* Default hidden */
        z-index: 3000;
        box-shadow: 0 0 20px rgba(0,0,0,0.8);
    `;

    recipeDiv.innerHTML = `
        <h1 style="text-align:center; color: #deb887; margin-bottom: 20px; border-bottom: 1px solid #deb887; padding-bottom: 10px;">Buku Resep</h1>
        
        <div style="margin-bottom: 30px;">
            <h2 style="color: #ffdab9; margin-bottom: 2px;">1. Lumpia</h2>
            <div style="font-size: 14px; color: #aaa; margin-bottom: 10px; font-style: italic;">(Khas Semarang, Jawa Tengah)</div>
            
            <strong>Bahan:</strong>
            <ul style="margin-top: 5px; color: #d3d3d3;">
                <li>Kulit Lumpia</li>
                <li>Ayam Filet</li>
                <li>Wortel</li>
                <li>Kubis</li>
            </ul>
            <strong>Instruksi:</strong>
            <ol style="margin-top: 5px; color: #d3d3d3; line-height: 1.4;">
                <li>Persiapankan bahan dengan memotong ayam filet, kubis, dan wortel menggunakan pisau di atas talenan sebanyak 1 potong untuk tiap bahan.</li>
                <li>Ambil tumpukan kulit lumpia, lalu letakan di atas talenan dan pisahkan menjadi 1 lembar kulit.</li>
                <li>Masukkan 1 potong ayam, kubis, dan wortel ke atas kulit lumpia. Gulung kulit lumpia hingga isian tertutup.</li>
                <li>Persiapkan wajan, lalu tuangkan minyak.</li>
                <li>Letakan wajan di atas kompor dan nyalakan kompor.</li>
                <li>Letakan lumpia diatas wajan yang sudah berisi minyak lalu tunggu hingga lumpia berwarna emas kecoklatan.</li>
                <li>Tunggu lumpia hingga berwarna emas kecoklatan, ketika sudah emas kecoklatan lumpia sudah siap diambil dan disajikan.</li>
            </ol>
        </div>

        <div style="margin-bottom: 30px;">
            <h2 style="color: #ffdab9; margin-bottom: 2px;">2. Rendang</h2>
            <div style="font-size: 14px; color: #aaa; margin-bottom: 10px; font-style: italic;">(Khas Minangkabau, Sumatera Barat)</div>

            <strong>Bahan:</strong>
            <ul style="margin-top: 5px; color: #d3d3d3;">
                <li>Daging</li>
                <li>Santan</li>
                <li>Bumbu Rendang</li>
            </ul>
            <strong>Instruksi:</strong>
            <ol style="margin-top: 5px; color: #d3d3d3; line-height: 1.4;">
                <li>Potong daging menggunakan pisau di atas talenan sesuai jumlah yang diinginkan.</li>
                <li>Siapkan wajan di atas meja. Tuangkan santan terlebih dahulu lalu bumbu rendang ke dalam wajan.</li>
                <li>Masukkan potongan daging ke dalam wajan yang sudah berisi santan dan bumbu.</li>
                <li>Pindahkan wajan ke atas kompor, lalu nyalakan api.</li>
                <li>Tunggu hingga rendang berubah warna menjadi kecoklatan, lalu angkat dan letakkan di atas piring.</li>
                <li>Hias rendang dengan menambahkan daun kubis. Lalu rendang sudah siap disajikan.</li>
            </ol>
        </div>

        <div style="margin-bottom: 10px;">
            <h2 style="color: #ffdab9; margin-bottom: 2px;">3. Lawar</h2>
            <div style="font-size: 14px; color: #aaa; margin-bottom: 10px; font-style: italic;">(Khas Bali)</div>

            <strong>Bahan:</strong>
            <ul style="margin-top: 5px; color: #d3d3d3;">
                <li>Ayam Filet</li>
                <li>Kacang Panjang</li>
                <li>Kelapa</li>
                <li>Minyak (Gunakan Air untuk merebus)</li> 
                <li>Bumbu Lawar</li>
            </ul>
            <strong>Instruksi:</strong>
            <ol style="margin-top: 5px; color: #d3d3d3; line-height: 1.4;">
                <li>Potong ayam filet menggunakan pisau di atas talenan dengan minimal 3 ayam potong.</li>
                <li>Siapakan wajan di atas meja. Tuangkan air ke dalam wajan.</li>
                <li>Masukan potongan ayam filet ke dalam wajan yang sudah berisi air.</li>
                <li>Pindahkan wajan ke atas kompor, lalu nyalakan api.</li>
                <li>Tunggu hingga 10 sampai 20 detik, lalu angkat dan letakan di atas talenan.</li>
                <li>Potong kacang Panjang menggunakan pisau di atas talenan dengan minimal 3 potong.</li>
                <li>Parut kelapa menggunakan parutan diatas talenan dengan minimal 3 parutan.</li>
                <li>Masukan rebusan ayam potong, potongan kacang panjang, parutan kelapa, dan bumbu lawar ke atas talenan. Aduk hingga merata.</li>
                <li>Setelah diaduk, pindahkan lawar ke atas piring. Lawar sudah jadi dan siap dihidangkan.</li>
            </ol>
        </div>

        <div style="text-align: center; margin-top: 20px; font-size: 12px; color: #888;">
            Tekan <strong>[E]</strong> lagi untuk menutup buku resep.
        </div>
    `;

    document.body.appendChild(recipeDiv); 

    const recipeHintDiv = document.createElement('div');
    recipeHintDiv.style.cssText = `
        position: absolute;
        bottom: 20px;
        left: 20px;
        color: rgba(255, 255, 255, 0.8);
        font-family: Arial, sans-serif;
        font-size: 14px;
        font-weight: bold;
        text-shadow: 1px 1px 3px black;
        pointer-events: none;
        user-select: none;
        z-index: 1000;
        background-color: rgba(0,0,0,0.3);
        padding: 5px 10px;
        border-radius: 5px;
    `;
    recipeHintDiv.innerText = "Press [E] to Open/Close Recipe Book";
    document.body.appendChild(recipeHintDiv);

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
        if(interactingObject)
        {
            interactionPromptDiv.style.display = 'none';

            const asGame = asGameObject(interactingObject.userData)!;
            const interactor = asGame.interactableData!;

            const infoString = interactor.interactInfo(interactingObject);
            if(infoString)
            {
                interactionPromptDiv.style.display = 'block';
                interactionPromptDiv.innerText = `Press F to ${infoString}`;
            }
        }
        else
        {
            interactionPromptDiv.style.display = 'none';
        }
        
    }
    if(lockPromptDiv)
    {
        lockPromptDiv.style.display = pointerLockControls.isLocked ? 'none' : 'block';
    }
}

function setupSky() {
    const sky = new Sky();
    sky.scale.setScalar(450000);
    scene.add(sky);

    const sun = new THREE.Vector3();

    const effectController = {
        turbidity: 8,
        rayleigh: 1.5,
        mieCoefficient: 0.005,
        mieDirectionalG: 0.8,
        elevation: 2,
        azimuth: 180,
    };

    const uniforms = sky.material.uniforms;
    uniforms['turbidity'].value = effectController.turbidity;
    uniforms['rayleigh'].value = effectController.rayleigh;
    uniforms['mieCoefficient'].value = effectController.mieCoefficient;
    uniforms['mieDirectionalG'].value = effectController.mieDirectionalG;

    const phi = THREE.MathUtils.degToRad(90 - effectController.elevation);
    const theta = THREE.MathUtils.degToRad(effectController.azimuth);

    sun.setFromSphericalCoords(1, phi, theta);
    uniforms['sunPosition'].value.copy(sun);

    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.6;

    addClouds();
}

function addClouds() {
    const cloudMaterial = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.7,
        side: THREE.DoubleSide
    });

    for (let i = 0; i < 15; i++) {
        const cloudGroup = new THREE.Group();
        
        // 3-5 overlapping spheres per cloud
        const puffCount = 3 + Math.floor(Math.random() * 3);
        for (let j = 0; j < puffCount; j++) {
            const puffGeometry = new THREE.SphereGeometry(
                5 + Math.random() * 8,
                8,
                8
            );
            const puff = new THREE.Mesh(puffGeometry, cloudMaterial);
            puff.position.set(
                (Math.random() - 0.5) * 15,
                (Math.random() - 0.5) * 3,
                (Math.random() - 0.5) * 8
            );
            puff.scale.set(
                1 + Math.random() * 0.5,
                0.6 + Math.random() * 0.3,
                1 + Math.random() * 0.5
            );
            cloudGroup.add(puff);
        }

        const angle = (i / 15) * Math.PI * 2;
        const distance = 80 + Math.random() * 100;
        cloudGroup.position.set(
            Math.cos(angle) * distance,
            20 + Math.random() * 30,
            Math.sin(angle) * distance
        );

        cloudGroup.rotation.y = Math.random() * Math.PI;
        scene.add(cloudGroup);
    }
}

function setupScenery()
{
    //Gunung
    const mountain1 = loadModel("gunung.fbx");
    mountain1.scale.setScalar(0.2);
    mountain1.position.set(50.0, 0.0, -10.0);
    scene.add(mountain1);

    const mountain2 = loadModel("gunung.fbx");
    mountain2.scale.setScalar(0.2);
    mountain2.position.set(-100.0, 0.0, 0.0);
    scene.add(mountain2);

    const mountain3 = loadModel("gunung.fbx");
    mountain3.scale.setScalar(0.25);
    mountain3.position.set(-20.0, -0.5, 115.0);
    scene.add(mountain3);

    //Pohon
    const tree1 = loadModel("mangga_pohon.glb");
    tree1.scale.setScalar(0.45);
    tree1.position.set(-3.0, 0.0, 0.0);
    scene.add(tree1);

    const tree2 = loadModel("alt_mangga_pohon.glb");
    tree2.scale.setScalar(0.45);
    tree2.position.set(3.0, 0.0, -3.0);
    scene.add(tree2);

    const tree3 = loadModel("mangga_pohon.glb");
    tree3.scale.setScalar(0.35);
    tree3.position.set(-5.0, 0.0, 9.0);
    scene.add(tree3);

    const tree4 = loadModel("alt_mangga_pohon.glb");
    tree4.scale.setScalar(0.45);
    tree4.position.set(6.0, 0.0, 6.0);
    scene.add(tree4);

    const tree5 = loadModel("alt_mangga_pohon.glb");
    tree5.scale.setScalar(0.55);
    tree5.position.set(20.0, 0.0, 3.0);
    scene.add(tree5);

    const tree6 = loadModel("mangga_pohon.glb");
    tree6.scale.setScalar(0.55);
    tree6.position.set(16.0, 0.0, -20.0);
    scene.add(tree6);

    const tree7 = loadModel("alt_mangga_pohon.glb");
    tree7.scale.setScalar(0.6);
    tree7.position.set(-8.0, 0.0, -20.0);
    scene.add(tree7);

    const tree8 = loadModel("alt_mangga_pohon.glb");
    tree8.scale.setScalar(0.6);
    tree8.position.set(-20.0, 0.0, 12.0);
    scene.add(tree8);

    //Meja
    table = loadModel("meja.glb");
    table.scale.setScalar(1);
    table.position.set(0.0, 0.85, 0.0);
    scene.add(table);
    makePlacable(table, {
        placeOffset: new THREE.Vector3(0.0, 0.0225, 0.0),
    }, "meja");

    secondTable = loadModel("meja.glb");
    secondTable.scale.setScalar(1);
    secondTable.position.set(2.5, 0.85, 2);
    secondTable.rotateY(90.0 * MathUtils.DEG2RAD);
    scene.add(secondTable);
    makePlacable(secondTable, {
        placeOffset: new THREE.Vector3(0.0, 0.0225, 0.0),
    }, "meja");

    //Bahan
    const kacangPanjang = loadModel("kacangpanjang.glb");
    kacangPanjang.scale.setScalar(0.08);
    kacangPanjang.position.set(0.08, 0.9874999999999999, -0.04);
    scene.add(kacangPanjang);
    makeDraggable(kacangPanjang, new THREE.Vector3(), "kacangpanjang");
    addObjOnPlaceableObject(table, kacangPanjang);

    const ayamFillet = loadModel("source/ayamfilet.glb");
    ayamFillet.scale.setScalar(0.75);
    ayamFillet.position.set(-0.476956506508043, 0.9874999999999999, -0.22470502536926745);
    scene.add(ayamFillet);
    makeDraggable(ayamFillet, new THREE.Vector3(0, 0.115, 0.05), "ayamfillet");
    addObjOnPlaceableObject(table, ayamFillet); 
    
    const wortel = loadModel("wortel.fbx");
    wortel.scale.setScalar(0.00075);
    wortel.position.set(-0.8367748388717876, 0.8875, -0.16433061869105225);
    wortel.rotateX(MathUtils.degToRad(90.0));
    wortel.rotateZ(MathUtils.degToRad(30.0));
    scene.add(wortel);
    makeDraggable(wortel, new THREE.Vector3(0, 0.015, 0), "wortel");
    addObjOnPlaceableObject(table, wortel);

    const kubis = loadModel("source/kubis.glb");
    kubis.scale.setScalar(0.03);
    kubis.position.set(-0.9615577106928938, 0.8724999999999999, -0.4037088000643806);
    scene.add(kubis);
    makeDraggable(kubis, new THREE.Vector3(), "kubis");
    addObjOnPlaceableObject(table, kubis);

    const kulitLumpiaBanyak = loadModel("kulit-lumpia-banyak.glb");
    kulitLumpiaBanyak.scale.setScalar(0.15);
    kulitLumpiaBanyak.position.set(-1.0194519010660004, 0.8724999999999999, 0.4082656372576201);
    scene.add(kulitLumpiaBanyak);
    makeDraggable(kulitLumpiaBanyak, new THREE.Vector3(), "kulitlumpia");
    addObjOnPlaceableObject(table, kulitLumpiaBanyak);

    //Alat
    const pisau = loadModel("pisau.glb");
    pisau.scale.setScalar(1);
    pisau.position.set(2.14319597296689, 0.9574999999999999, 1.922576558006232);
    pisau.rotateX(MathUtils.degToRad(90.0));
    pisau.rotateZ(MathUtils.degToRad(-30.0));
    scene.add(pisau);
    makeDraggable(pisau, new THREE.Vector3(0.0, 0.085, 0.0), "pisau");
    addObjOnPlaceableObject(secondTable, pisau);

    const talenan = loadModel("talenan.glb");
    talenan.scale.setScalar(1);
    talenan.position.set(2.126755075186629, 0.8875, 1.2948680512229929);
    talenan.rotateY(90 * MathUtils.DEG2RAD)
    scene.add(talenan);
    makeDraggable(talenan, new THREE.Vector3(0.0, 0.015), "talenan");
    makePlacable(talenan, {
        placeOffset: new THREE.Vector3(0, 0.015)
    });
    makeInteractable(talenan, {
        interactInfo: () =>
            {
                return "interact with Talenan";
            },
        onInteract: (obj) =>
        {
            runRecipeLogic(obj);
        }
    })
    addObjOnPlaceableObject(secondTable, talenan);

    //Cooking
    const stove = loadModel("stove.glb");
    stove.scale.setScalar(1);
    stove.position.set(-2.45, 0.20, 2.0);
    scene.add(stove);
    komporGlobal = stove;
    makePlacable(stove, {
        placeOffset: new THREE.Vector3(0.0, 0.775, 0.0)
    }, "kompor");
    makeInteractable(stove, {
        interactInfo: () =>
            {
                return 'interact with Kompor'
            },
        onInteract: onInteractKompor
    })

    const api = loadModel("api-kompor.glb");
    api.scale.setScalar(1);
    api.position.set(-3.15, -0.015, 1.1225);
    scene.add(api);
    komporApiGlobal = api;
    
    wajan = loadModel("wajan-flat.glb");
    wajan.scale.setScalar(0.15);
    wajan.position.set(2.9966307538490655, 0.8989999999999999, 1.0866169943996582);
    scene.add(wajan);
    makeDraggable(wajan, new THREE.Vector3(0.0, 0.0265, 0), "wajan");
    makePlacable(wajan, {
        placeOffset: new THREE.Vector3()
    });
    makeInteractable(wajan, {
        interactInfo: (obj) =>
            {
                if(isKomporActive)
                {
                    return undefined;
                }

                const asGame = asGameObject(obj.userData)!;
                const placeable = asGame.placeableData!;
                if(liquidType != "")
                {
                    if(placeable.placedObject.length == 0)
                    {
                        return "remove liquid from Wajan";
                    }
                    else
                    {
                        return undefined;
                    }
                }

                if(placeable.placedObject.length == 1 && isLiquidObj(placeable.placedObject[0]))
                {
                    return "pour liquid on Wajan";
                }

                return undefined;
            },
        onInteract: runInteractWajan
    })
    wajanPreferableOnKompor = new THREE.Vector3(-2.429257734230651, 0, 1.9208015356337707);
    addObjOnPlaceableObject(secondTable, wajan);

    komporLiquid = loadModel("liquid.glb", false);
    komporLiquid.scale.setScalar(0.155);
    komporLiquid.position.set(wajan.position.x, wajan.position.y, wajan.position.z - 0.55);
    scene.add(komporLiquid);

    komporLiquidSolid = loadModel("liquid-solid.glb", false);
    komporLiquidSolid.scale.setScalar(0.155);
    komporLiquidSolid.position.set(wajan.position.x, wajan.position.y, wajan.position.z - 0.55);
    scene.add(komporLiquidSolid);

    const botolAir = loadModel("botol.glb");
    botolAir.scale.setScalar(2);
    botolAir.position.set(-0.25399171313723196, 1.0725, -0.5581675908869088);
    makeDraggable(botolAir, new THREE.Vector3(0, 0.2, 0), "botolair");
    addObjOnPlaceableObject(table, botolAir);
    scene.add(botolAir);

    const botolMinyak = loadModel("botol.glb");
    botolMinyak.scale.setScalar(2);
    botolMinyak.position.set(-0.10860142271669282, 1.0725, -0.5667752260118005);
    makeDraggable(botolMinyak, new THREE.Vector3(0, 0.2, 0), "botolminyak");
    addObjOnPlaceableObject(table, botolMinyak);
    multiplyOriginalColor(botolMinyak, 1, 1, 0.05);
    scene.add(botolMinyak);

    const santan = loadModel("santan.glb");
    santan.scale.setScalar(1);
    santan.position.set(0.18000271189746975, 0.9574999999999999, -0.5861990967034701);
    makeDraggable(santan, new THREE.Vector3(0, 0.085, 0), "santan");
    addObjOnPlaceableObject(table, santan);
    scene.add(santan);

    const bumbu = loadModel("bumbu.glb");
    bumbu.scale.setScalar(1);
    bumbu.position.set(-0.026960705279233776, 0.9574999999999999, -0.581151961586148);
    makeDraggable(bumbu, new THREE.Vector3(0, 0.085, 0), "bumburendang");
    makeInteractable(bumbu, {
        interactInfo: (obj) =>
        {
            const gameOb = asGameObject(obj.userData)!;
            const dragable = gameOb.selectableData!;

            if(dragable.placedOn == null)
            {
                return undefined;
            }

            const placedOnOb = asGameObject(dragable.placedOn.userData)!;
            if(placedOnOb.typeId != "wajan")
            {
                return undefined;
            }
            if(liquidType != "santan")
            {
                return undefined;
            }

            return "pour bumbu rendang in Santan";
        },
        onInteract: (obj) =>
        {
            const asGame = asGameObject(obj.userData)!;
            const asInter = asGame.interactableData!;

            const check = asInter.interactInfo(obj);
            if(!check)
            {
                return;
            }

            liquidType = "santanrendang";
            loadAndPlaySound('./sounds/sauce-drop.mp3', 0.8);
        }
    })
    addObjOnPlaceableObject(table, bumbu);
    scene.add(bumbu);

    const daging = loadModel('daging.fbx');
    daging.scale.setScalar(0.00085);
    daging.position.set(-0.48807871030583994, 0.8724999999999999, 0.3854260533430295);
    makeDraggable(daging, new THREE.Vector3(), "daging");
    addObjOnPlaceableObject(table, daging);
    scene.add(daging);

    const piring = loadModel('piring.glb');
    piring.scale.setScalar(1);
    piring.position.set(2.5023703872092304, 0.9225, 2.5617065791579865);
    makeDraggable(piring, new THREE.Vector3(0, 0.05), "piring");
    makePlacable(piring, {
        placeOffset: new THREE.Vector3(0, 0, 0)
    });
    addObjOnPlaceableObject(secondTable, piring);

    scene.add(piring);

    const parutan_kelapa = loadModel('parutan-kelapa.glb');
    parutan_kelapa.scale.setScalar(0.02);
    parutan_kelapa.position.set(2.8252011308857745, 0.9324999999999999, 1.5965642122410468);
    makeDraggable(parutan_kelapa, new THREE.Vector3(0, 0.06), "parutan");
    addObjOnPlaceableObject(secondTable, parutan_kelapa);
    scene.add(parutan_kelapa);

    const kelapa = loadModel('kelapa.fbx');
    kelapa.scale.setScalar(0.0008);
    kelapa.position.set(0.4942106382803372, 0.8724999999999999, -0.4739763448958844);
    makeDraggable(kelapa, new THREE.Vector3(0, 0), "kelapa");
    addObjOnPlaceableObject(table, kelapa);
    scene.add(kelapa);

    const bumbugenep = loadModel('bumbugenep.glb');
    bumbugenep.scale.setScalar(0.65);
    bumbugenep.position.set(0.5279181404867753, 0.9324999999999999, 0.007203305547594019);
    makeDraggable(bumbugenep, new THREE.Vector3(-0.25, 0.06, 0.5), "bumbugenep");
    addObjOnPlaceableObject(table, bumbugenep);
    scene.add(bumbugenep);
    multiplyOriginalColor(bumbugenep, 0.4, 1, 0.1);

    setupRecipe();
}

function isLiquidObj(obj: THREE.Object3D)
{
    const asGame = asGameObject(obj.userData)!;
    return asGame.typeId == "botolair" || asGame.typeId == "botolminyak" || asGame.typeId == "santan";
}

function setupRecipe()
{
    recipes.push({
        ingredients: [
            {
                typeId: 'ayamfillet',
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
                obj(interactable) {
                    const ayamdadu = loadModel("source/ayamdadu.glb");
                    ayamdadu.scale.setScalar(0.5);
                    scene.add(ayamdadu);
                    makeDraggable(ayamdadu, new THREE.Vector3(), "ayamdadu");
                    makeFoodable(ayamdadu, {
                        cookingData: {
                            cookedInMinyak: 0.0,
                            cookedInAir: 0.0
                        },
                        isCanContinueCooking(obj, foodData) {
                            if(liquidType == "air" || liquidType == "minyak")
                            {
                                return true;
                            }

                            return false;
                        },
                        updateCooking(obj, foodData) {
                            const data : {
                                cookedInMinyak: number,
                                cookedInAir: number
                            } = foodData.cookingData;

                            if(liquidType == "air")
                            {
                                data.cookedInAir += deltaTime;
                            }
                            else if(liquidType == "minyak")
                            {
                                data.cookedInMinyak += deltaTime;
                            }

                            const targetCookTime = 10.0;
                            multiplyOriginalColor(obj,
                                beColorIn(0.5, data.cookedInAir, targetCookTime) * beColorIn(0.87, data.cookedInMinyak, targetCookTime),
                                beColorIn(0.5, data.cookedInAir, targetCookTime) * beColorIn(0.5, data.cookedInMinyak, targetCookTime),
                                beColorIn(0.5, data.cookedInAir, targetCookTime) * beColorIn(0.06, data.cookedInMinyak, targetCookTime)
                            )
                        },
                    });

                    return ayamdadu
                },
                placeOffset: new THREE.Vector3(0, 0, 0)
            }
        ],
        successSound: {
            path: './sounds/chop.mp3',
            volume: 0.8,
            fadeIn: 0,
            fadeOut: 0,
            startTime: 0,
            control: null,
            loop: false,
        }
    },
    {
        ingredients: [
            {
                typeId: 'kelapa',
                minimumCount: 1,
                useCount: 0
            },
            {
                typeId: 'parutan',
                minimumCount: 1,
                useCount: 0
            }
        ],
        output: [
            {
                obj(interactable) {
                    const parutankelapa = loadModel("coconut_flakes.glb");
                    parutankelapa.scale.setScalar(0.075);
                    scene.add(parutankelapa);
                    makeDraggable(parutankelapa, new THREE.Vector3(-0.05, 0.015, -0.15), "kelapaparut");

                    return parutankelapa
                },
                placeOffset: new THREE.Vector3(-0.05, 0, -0.05)
            }
        ],
        successSound: {
            path: './sounds/grating.mp3',
            volume: 0.6,
            fadeIn: 0,
            fadeOut: 0,
            startTime: 0,
            control: null,
            loop: false,
        }
    },
    {
        ingredients: [
            {
                typeId: 'kacangpanjang',
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
                obj(interactable) {
                    const kacangpanjangpotong = loadModel('kacangpanjangpotongbanyak.glb');
                    kacangpanjangpotong.scale.setScalar(0.04);
                    makeDraggable(kacangpanjangpotong, new THREE.Vector3(0, 0), "kacangpanjangpotong");
                    scene.add(kacangpanjangpotong);

                    return kacangpanjangpotong
                },
                placeOffset: new THREE.Vector3(0, 0, 0)
            }
        ],
        successSound: {
            path: './sounds/chop.mp3',
            volume: 0.8,
            fadeIn: 0,
            fadeOut: 0,
            startTime: 0,
            control: null,
            loop: false,
        }
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
                obj(interactable) {
                    const lettuce_cuts = loadModel("source/kubis-potong.glb");
                    lettuce_cuts.scale.setScalar(0.03);
                    scene.add(lettuce_cuts);
                    makeDraggable(lettuce_cuts, new THREE.Vector3(), "kubispotong");

                    return lettuce_cuts
                },
                placeOffset: new THREE.Vector3(0, 0, 0)
            }
        ],
        successSound: {
            path: './sounds/chop.mp3',
            volume: 0.8,
            fadeIn: 0,
            fadeOut: 0,
            startTime: 0,
            control: null,
            loop: false,
        }
    },
    {
        ingredients: [
            {
                typeId: 'wortel',
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
                obj(interactable) {
                    const wortelCuts = loadModel("potongan wortel.fbx");
                    wortelCuts.scale.setScalar(0.0005);
                    scene.add(wortelCuts);
                    makeDraggable(wortelCuts, new THREE.Vector3(), "wortelpotong");

                    return wortelCuts
                },
                placeOffset: new THREE.Vector3(0, 0, 0)
            }
        ],
        successSound: {
            path: './sounds/chop.mp3',
            volume: 0.8,
            fadeIn: 0,
            fadeOut: 0,
            startTime: 0,
            control: null,
            loop: false,
        }
    },
    {
        ingredients: [
            {
                typeId: 'kulitlumpia',
                minimumCount: 1,
                useCount: 0
            }
        ],
        output: [
            {
                obj(interactable) {
                    const lumpiaSingle = loadModel("kulit-lumpia-single.glb");
                    lumpiaSingle.scale.setScalar(0.15);
                    scene.add(lumpiaSingle);
                    makeDraggable(lumpiaSingle, new THREE.Vector3(), "kulitlumpiasingle");

                    return lumpiaSingle
                },
                placeOffset: new THREE.Vector3(0, 0, 0)
            }
        ],
        successSound: {
            path: './sounds/peeling-all.mp3',
            volume: 0.8,
            fadeIn: 0,
            fadeOut: 0,
            startTime: 0,
            control: null,
            loop: false,
        }
    },
    {
        ingredients: [
            {
                typeId: 'kulitlumpiasingle',
                minimumCount: 1,
                useCount: 1
            },
            {
                typeId: 'wortelpotong',
                minimumCount: 1,
                useCount: 1
            },
            {
                typeId: 'kubispotong',
                minimumCount: 1,
                useCount: 1
            },
            {
                typeId: 'ayamdadu',
                minimumCount: 1,
                useCount: 1
            }
        ],
        output: [
            {
                obj(interactable) {
                    const lumpiaSingle = loadModel("lumpia-single.glb");
                    lumpiaSingle.scale.setScalar(1.75);
                    scene.add(lumpiaSingle);
                    makeDraggable(lumpiaSingle, new THREE.Vector3(-0.125 / 2, -0.125), "lumpiasingle");
                    makeFoodable(lumpiaSingle, {
                        cookingData: {
                            cookTime: 1.0
                        },
                        isCanContinueCooking: (obj, foodData) =>
                        {
                            if(liquidType != "minyak")
                            {
                                return false;
                            }
                            return true
                        },
                        updateCooking: (obj, foodData) =>
                        {
                            const data: {
                                cookTime: number
                            } = foodData.cookingData;

                            data.cookTime += deltaTime;

                            const cookTargetTime = 10.0;
                            multiplyOriginalColor(obj, beColorIn(0.85, data.cookTime, cookTargetTime), beColorIn(0.65, data.cookTime, cookTargetTime), beColorIn(0.35, data.cookTime, cookTargetTime))
                        }
                    });

                    return lumpiaSingle
                },
                placeOffset: new THREE.Vector3(0, 0, 0)
            }
        ],
        successSound: {
            path: './sounds/peeling-all.mp3',
            volume: 0.8,
            fadeIn: 0,
            fadeOut: 0,
            startTime: 0,
            control: null,
            loop: false,
        }
    },
    {
        ingredients: [
            {
                typeId: 'daging',
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
                obj(interactable) {
                    const dagingkecil = loadModel("daging-kecil.fbx");
                    dagingkecil.scale.setScalar(0.0015);
                    scene.add(dagingkecil);
                    makeDraggable(dagingkecil, new THREE.Vector3(0, -0.145, 0), "dagingpotong");
                    makeFoodable(dagingkecil, {
                        cookingData: {
                            cookInSantan: 0.0,
                            cookInSantanRendang: 0.0
                        },
                        isCanContinueCooking: (obj, foodData) =>
                        {
                            if(liquidType != "santan" && liquidType != "santanrendang")
                            {
                                return false;
                            }

                            return true;
                        },
                        updateCooking: (obj, foodData) =>
                        {
                            const data : {
                                cookInSantan: number,
                                cookInSantanRendang: number
                            } = foodData.cookingData;

                            if(liquidType == "santan")
                            {
                                data.cookInSantan += deltaTime;
                            }
                            else if(liquidType == "santanrendang")
                            {
                                data.cookInSantanRendang += deltaTime;
                            }

                            const targetCookTime = 10.0;
                            multiplyOriginalColor(obj,
                                beColorIn(0.5, data.cookInSantan, targetCookTime) * beColorIn(0.87, data.cookInSantanRendang, targetCookTime),
                                beColorIn(0.5, data.cookInSantan, targetCookTime) * beColorIn(0.5, data.cookInSantanRendang, targetCookTime),
                                beColorIn(0.5, data.cookInSantan, targetCookTime) * beColorIn(0.06, data.cookInSantanRendang, targetCookTime)
                            )
                        }
                    });

                    return dagingkecil
                },
                placeOffset: new THREE.Vector3(0, 0, 0)
            }
        ],
        successSound: {
            path: './sounds/chop.mp3',
            volume: 0.8,
            fadeIn: 0,
            fadeOut: 0,
            startTime: 0,
            control: null,
            loop: false,
        }
    },
    {
        ingredients: [
            {
                typeId: 'ayamdadu',
                minimumCount: 3,
                useCount: 3
            },
            {
                typeId: 'kacangpanjangpotong',
                minimumCount: 3,
                useCount: 3
            },
            {
                typeId: 'bumbugenep',
                minimumCount: 1,
                useCount: 0
            },
            {
                typeId: 'kelapaparut',
                minimumCount: 3,
                useCount: 3
            }
        ],
        aditionalChecker(recipe, objects)
        {
            for(let i = 0; i < objects.length; i++)
            {
                const asGame = asGameObject(objects[i].userData)!;
                console.log(asGame)

                if(asGame.typeId == 'ayamdadu')
                {
                    const asFood = asGame.foodData!;

                    const data : {
                        cookedInMinyak: number,
                        cookedInAir: number
                    } = asFood.cookingData;

                    console.log(data)

                    if(data.cookedInAir < 10.0 || data.cookedInAir > 20.0)
                    {
                        return false;
                    }
                }
            }

            return true;
        },
        output: [
            {
                obj(interactable) {
                    const lawar = loadModel('lawar.glb');
                    lawar.scale.setScalar(2.15);
                    makeDraggable(lawar, new THREE.Vector3(-0.1, -0.065, -0.1), "lawar");
                    scene.add(lawar);

                    return lawar
                },
                placeOffset: new THREE.Vector3(0, 0, 0)
            }
        ],
        successSound: {
            path: './sounds/mix lawar.mp3',
            volume: 0.8,
            fadeIn: 0,
            fadeOut: 0,
            startTime: 0,
            control: null,
            loop: false,
        }
    }
    );
}

function multiplyOriginalColor(obj: THREE.Object3D, r: number, g: number, b: number)
{
    obj.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh;
            if (Array.isArray(mesh.material)) {
                for(let i = 0; i < mesh.material.length; i++)
                {
                    if(!("color" in mesh.material))
                    {
                        throw new Error("Cannot find property color in material!");
                    }

                    const lastCol = mesh.material.color as THREE.Color;
                    const meshMatAny = mesh.material as any;
                    const originalCol = meshMatAny.userData.originalColor as THREE.Color;

                    lastCol.set(originalCol.r * r, originalCol.g * g, originalCol.b * b);
                }
            } else if (mesh.material) {
                if(!("color" in mesh.material))
                {
                    throw new Error("Cannot find property color in material!");
                }

                const lastCol = mesh.material.color as THREE.Color;
                const originalCol = mesh.material.userData.originalColor as THREE.Color;

                lastCol.set(originalCol.r * r, originalCol.g * g, originalCol.b * b);
            }
        }
    });
}

function beColorIn(targetColor: number, passedTime: number, targetTime: number)
{
    const diff = 1.0 - targetColor;
    const mul = passedTime / targetTime;

    return Math.max(0, 1.0 - (diff * mul));
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
        if(recipe.aditionalChecker)
        {
            if(!recipe.aditionalChecker(recipe, placeableData.placedObject))
            {
                invalid = true;
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
                            const obj = placeableData.placedObject[a];

                            removeObjOnPlaceableObject(obj);
                            removeObjectClearly(obj);
                            break;
                        }
                    }
                }
            }
            for(let j = 0; j < recipe.output.length; j++)
            {
                const spawnedObj = recipe.output[j].obj(obj);
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
        if (successRecipe.successSound !== undefined) {
            const s = successRecipe.successSound;
            successRecipe.successSound.control = await loadAndPlaySound(
                s.path, 
                s.volume, 
                s.fadeIn, 
                s.fadeOut, 
                s.startTime, 
                s.loop
            ); 
        }
    }
    else
    {
        loadAndPlaySound(failedSoundPath, 0.6);
    }
}

function runInteractWajan(obj: THREE.Object3D)
{
    const gameObj = asGameObject(obj.userData)!;
    const placeable = gameObj.placeableData!;
    const wajanInteractInfo = gameObj.interactableData!.interactInfo(obj);

    if(wajanInteractInfo == undefined)
    {
        return;
    }
    if(placeable.placedObject.length == 0)
    {
        if (liquidType == "minyak") {
            loadAndPlaySound('./sounds/pour-oil.mp3', 1); 
        } 
        else if (liquidType != "") {
            loadAndPlaySound('./sounds/pour-water.mp3', 1);
        }
        liquidColorMultiplier.set(1, 1, 1);
        liquidType = "";
        liquidCookTime = 0;

        return;
    }

    const currentBottle = placeable.placedObject[0];
    const currentAsGameObj = asGameObject(currentBottle.userData)!;

    if(currentAsGameObj.typeId == "botolair")
    {
        liquidType = "air";
        liquidCookTime = 0;
        liquidColorMultiplier.set(1, 1, 1);
        loadAndPlaySound('./sounds/pour-water.mp3', 1);
    }
    else if(currentAsGameObj.typeId == "botolminyak")
    {
        liquidType = "minyak";
        liquidCookTime = 0;
        liquidColorMultiplier.set(1, 1, 1);
        loadAndPlaySound('./sounds/pour-oil.mp3', 1);
    }
    else if(currentAsGameObj.typeId == "santan")
    {
        liquidType = "santan";
        liquidCookTime = 0;
        liquidColorMultiplier.set(1, 1, 1);
        loadAndPlaySound('./sounds/pour-water.mp3', 1);
    }
    else
    {
        throw new Error("Cannot find liquid type!");
    }
}

function removeObjectClearly(obj: THREE.Object3D)
{
    const gameObj = asGameObject(obj.userData);

    if(gameObj != null)
    {
        if(gameObj.interactableData)
        {
            const index = interactableObjects.indexOf(obj);
            if(index > 1)
            {
                interactableObjects.splice(index, 1);
            }
        }
        if(gameObj.placeableData)
        {
            const index = placeableObjects.indexOf(obj);
            if(index > 1)
            {
                placeableObjects.splice(index, 1);
            }
        }
        if(gameObj.selectableData)
        {
            const index = draggableObjects.indexOf(obj);
            if(index > 1)
            {
                draggableObjects.splice(index, 1);
            }
        }
    }

    scene.remove(obj);
}

function addHelperGrid() {
    const size = 300;
    const divisions = 300;
    const colorGrid = 0x888888;

    const gridXZ = new THREE.GridHelper(size, divisions, colorGrid, colorGrid);
    (gridXZ.material as THREE.Material).opacity = 0.3;
    (gridXZ.material as THREE.Material).transparent = true;
    //scene.add(gridXZ);

    const groundGeometry = new THREE.PlaneGeometry(size, size);
    const groundMaterial = new THREE.MeshStandardMaterial({
        color: 0x2d7d2e,
        side: THREE.DoubleSide,
    });
    const groundPlane = new THREE.Mesh(groundGeometry, groundMaterial);
    groundPlane.rotation.x = Math.PI / 2;
    groundPlane.position.y = -0.01;
    groundPlane.receiveShadow = true;
    scene.add(groundPlane);
}

function updateShadow()
{
    if (!directionalLight || !camera) return;
    if(!enableShadow) return;

    const sunOffset = new THREE.Vector3(0, 50, 0);
    directionalLight.position.copy(camera.position).add(sunOffset);
    directionalLight.target.position.copy(camera.position);
    directionalLight.target.updateMatrixWorld();
}

function update()
{   
    checkRaycast();
    updateKomporLogic();
    updateShadow();

    const placeableTable = asGameObject(table.userData)!.placeableData!;
    for(let i = 0; i < placeableTable.placedObject.length; i++)
    {
        const inTableObj = placeableTable.placedObject[i];
        const inTableGameObj = asGameObject(inTableObj.userData)!;

        //console.log(`${inTableGameObj.typeId} ${inTableObj.position.x}, ${inTableObj.position.y}, ${inTableObj.position.z}`);
    }

    const placeableSecondTable = asGameObject(secondTable.userData)!.placeableData!;
    for(let i = 0; i < placeableSecondTable.placedObject.length; i++)
    {
        const inTableObj = placeableSecondTable.placedObject[i];
        const inTableGameObj = asGameObject(inTableObj.userData)!;

        //console.log(`${inTableGameObj.typeId} ${inTableObj.position.x}, ${inTableObj.position.y}, ${inTableObj.position.z}`);
    }
}
function isObjOnKomporLegit()
{
    const komporGame = asGameObject(komporGlobal.userData);
    const placeableData = komporGame?.placeableData!;

    let legit = true;

    for(let i = 0; i < placeableData.placedObject.length; i++)
    {
        const obj = placeableData.placedObject[i];
        const gameObj = asGameObject(obj.userData)!;

        if(gameObj.typeId != 'wajan')
        {
            legit = false;
            break;
        }

        let diffX = wajanPreferableOnKompor.x - obj.position.x;
        let diffZ = wajanPreferableOnKompor.z - obj.position.z;
        let magnitude = Math.sqrt(diffX * diffX + diffZ * diffZ);

        if(magnitude > 0.5)
        {
            legit = false;
        }

        const placeData = gameObj.placeableData!;

        for(let j = 0; j < placeData.placedObject.length; j++)
        {
            const cookingObj = placeData.placedObject[j];
            const gameObj = asGameObject(cookingObj.userData)!;

            if(!gameObj.foodData || !gameObj.foodData.isCanContinueCooking(cookingObj, gameObj.foodData))
            {
                legit = false;
                break;
            }
        }
    }
    if(placeableData.placedObject.length > 1)
    {
        legit = false;
    }

    return legit;
}
async function onInteractKompor(obj: THREE.Object3D)
{
    if(isKomporActive)
    {
        isKomporActive = false;
        if(gasSoundControl) {
            if(gasSoundControl.source) gasSoundControl.stop(1);
           
            gasSoundControl = null;
        }

        if(fryingSoundControl) {   
            if(fryingSoundControl.source) fryingSoundControl.stop(4);
            fryingSoundControl = null;
        }

        if(boilingSoundControl) {
            if(boilingSoundControl.source) boilingSoundControl.stop(4);
            boilingSoundControl = null;
        }
    }
    else
    {   
        isKomporActive = true;

        gasSoundControl = await loadAndPlaySound(
            './sounds/gass-loop.mp3', 
            0.5,
            0.5, 
            0.5, 
            0,   
            true 
        );
    }
}
function updateKomporLogic()
{
    komporLiquid.position.set(wajan.position.x, wajan.position.y, wajan.position.z - 0.55);
    komporLiquidSolid.position.set(wajan.position.x, wajan.position.y, wajan.position.z - 0.55);

    if(liquidType == "")
    {
        komporLiquid.visible = false;
        komporLiquidSolid.visible = false;
    }
    else
    {
        if(liquidType == "air")
        {
            komporLiquid.visible = true;
            multiplyOriginalColor(komporLiquid, 1 * liquidColorMultiplier.r, 1 * liquidColorMultiplier.g, 1 * liquidColorMultiplier.b);
        }
        else if(liquidType == "minyak")
        {
            komporLiquid.visible = true;
            multiplyOriginalColor(komporLiquid, 1 * liquidColorMultiplier.r, 1 * liquidColorMultiplier.g, 0 * liquidColorMultiplier.b);
        }
        else if(liquidType == "santan")
        {
            komporLiquidSolid.visible = true;
            multiplyOriginalColor(komporLiquidSolid, 0.9 * liquidColorMultiplier.r, 0.9 * liquidColorMultiplier.g, 0.9 * liquidColorMultiplier.b);
        }
        else if(liquidType == "santanrendang")
        {
            komporLiquidSolid.visible = true;
            multiplyOriginalColor(komporLiquidSolid, 0.76 * liquidColorMultiplier.r, 0.46 * liquidColorMultiplier.g, 0.09 * liquidColorMultiplier.b);
        }
    }

    if(isKomporActive)
    {
        if(!isObjOnKomporLegit())
        {
            isKomporActive = false;
            if(gasSoundControl && gasSoundControl.source) {
                gasSoundControl.stop(1);
                gasSoundControl = null;
            }
            
            if(fryingSoundControl && fryingSoundControl.source) {
                fryingSoundControl.stop(4);
                fryingSoundControl = null;
            }

            if(boilingSoundControl) {
                boilingSoundControl.stop(4);
                boilingSoundControl = null;
            }
            return;
        }

        komporApiGlobal.visible = true;
        const gameObj = asGameObject(komporGlobal.userData);
        const placeableData = gameObj?.placeableData!;

        if(liquidType != "")
        {
            liquidCookTime += deltaTime;
            if (liquidType == "minyak") {
                if (boilingSoundControl) {
                    boilingSoundControl.stop();
                    boilingSoundControl = null;
                }
                
                if(fryingSoundControl === null && isKomporActive) {
                    (async () => {
                        fryingSoundControl = await loadAndPlaySound(
                            './sounds/frying-loop.mp3', 
                            0.6, 1.5, 2.0, 0, true 
                        );
                    })();
                }
            }else 
            {
                if (fryingSoundControl) {
                    fryingSoundControl.stop();
                    fryingSoundControl = null;
                }

                if(boilingSoundControl === null && isKomporActive) {
                    (async () => {
                        boilingSoundControl = await loadAndPlaySound(
                            './sounds/boiling-water-loop.mp3', 
                            1, 2, 2.0, 0, true 
                        );
                    })();
                }
            }
        } 
        else 
        {
            if(fryingSoundControl && fryingSoundControl.source) {
                fryingSoundControl.stop(4);
                fryingSoundControl = null;
            }

            if(boilingSoundControl && boilingSoundControl.source) {
                boilingSoundControl.stop(4);
                boilingSoundControl = null;
            }
        }

        if(placeableData.placedObject.length <= 0)
        {
            return;
        }

        const wajanObj = gameObj?.placeableData?.placedObject[0]!;
        const wajanAsGameObj = asGameObject(wajanObj.userData)!;
        const wajanPlaceable = wajanAsGameObj.placeableData!;

        for(let i = 0; i < wajanPlaceable.placedObject.length; i++)
        {
            const cookObj = wajanPlaceable.placedObject[i];
            const cookGameObj = asGameObject(cookObj.userData)!;
            cookGameObj.foodData!.updateCooking(cookObj, cookGameObj.foodData!);
        }
    }
    else
    {
        komporApiGlobal.visible = false;

        if(fryingSoundControl && fryingSoundControl.source) {
            fryingSoundControl.stop(4);
            fryingSoundControl = null;
        }

        if(boilingSoundControl) {
            boilingSoundControl.stop(4); 
            boilingSoundControl = null;
        }
    }
}

function checkRaycast()
{
    const maxInteractingObjDistance = 2.0;
    const maxSelectedObjDistance = 2.0;
    const maxPlaceableObjDistance = 2.0;
    const maxHoverDistance = 3.0;
    const cameraDirection = new THREE.Vector3();
    camera.getWorldDirection(cameraDirection);

    updateHoverLabel(cameraDirection, maxHoverDistance);

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

function updateHoverLabel(cameraDirection: THREE.Vector3, maxDistance: number)
{
    const allHoverableObjects = [...draggableObjects, ...interactableObjects, ...placeableObjects];
    
    raycaster.set(camera.position, cameraDirection);
    const hoverIntersects = raycaster.intersectObjects(allHoverableObjects, true);

    hoveredObject = null;
    
    for (let i = 0; i < hoverIntersects.length; i++) {
        const intersection = hoverIntersects[i];
        
        if (intersection.distance > maxDistance) {
            continue;
        }

        let topObject: THREE.Object3D | null = intersection.object;
        while (topObject && topObject.parent) {
            const userData = topObject.userData as Partial<GameObjectData>;
            if (userData && userData.typeId && userData.displayName) {
                hoveredObject = topObject;
                break;
            }
            topObject = topObject.parent;
        }

        if (hoveredObject) {
            break;
        }
    }

    if (hoveredObject && !isMovingSelectedObject) {
        const gameData = hoveredObject.userData as GameObjectData;
        hoverLabelDiv.innerText = gameData.displayName;
        hoverLabelDiv.style.display = 'block';
    } else {
        hoverLabelDiv.style.display = 'none';
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
    placePos.add(new THREE.Vector3(0, selectedData.placeOffset.y, 0));
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

function typeIdToDisplayName(typeId: string): string {
    const nameMap: Record<string, string> = {
        'kacangpanjang': 'Kacang Panjang',
        'ayamfillet': 'Ayam Filet',
        'ayamdadu': 'Ayam Dadu',
        'wortel': 'Wortel',
        'wortelpotong': 'Wortel Potong',
        'kubis': 'Kubis',
        'kubispotong': 'Kubis Potong',
        'kulitlumpia': 'Banyak Kulit Lumpia',
        'kulitlumpiasingle': 'Kulit Lumpia',
        'lumpiasingle': 'Lumpia',
        'pisau': 'Pisau',
        'talenan': 'Talenan',
        'wajan': 'Wajan',
        'botolair': 'Botol Air',
        'botolminyak': 'Botol Minyak',
        'santan': 'Santan',
        'bumburendang': 'Bumbu Rendang',
        'daging': 'Daging',
        'piring': 'Piring',
        'stove': 'Kompor',
        'table': 'Meja',
        'parutan-kelapa': 'Parutan',
        'bumbugenep': 'Bumbu Genep',
        'kelapaparut': 'Kelapa Parut',
        'kacangpanjangpotong': 'Kacang Panjang Potong'
    };
    
    return nameMap[typeId.toLowerCase()] || typeId.charAt(0).toUpperCase() + typeId.slice(1);
}

function makeDraggable(obj: THREE.Object3D, offsetPlace: THREE.Vector3 = new THREE.Vector3(0, 0, 0), newTypeId: string | undefined = undefined, displayName: string | undefined = undefined) {
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
            displayName: displayName || typeIdToDisplayName(newTypeId),
            placeableData: null,
            selectableData: null,
            interactableData: null,
            foodData: null
        };
    } else if (displayName) {
        gameObj.displayName = displayName;
    } else if (!gameObj.displayName) {
        gameObj.displayName = typeIdToDisplayName(gameObj.typeId);
    }
    gameObj.selectableData = {
        placedOn: null,
        placeOffset: offsetPlace
    };

    obj.userData = gameObj;
}

function makeFoodable(obj: THREE.Object3D, foodData: FoodUserData, newTypeId: string | undefined = undefined, displayName: string | undefined = undefined) {
    let gameObj = asGameObject(obj.userData);
    if(!gameObj)
    {
        if(!newTypeId)
        {
            throw new Error("New registered gameObj must have newTypeData not be undefined")
        }

        gameObj = {
            typeId: newTypeId,
            displayName: displayName || typeIdToDisplayName(newTypeId),
            placeableData: null,
            selectableData: null,
            interactableData: null,
            foodData: null
        };
    } else if (displayName) {
        gameObj.displayName = displayName;
    } else if (!gameObj.displayName) {
        gameObj.displayName = typeIdToDisplayName(gameObj.typeId);
    }
    gameObj.foodData = foodData;

    obj.userData = gameObj;
}

function makePlacable(obj: THREE.Object3D, data: AddPlaceableUserData, newTypeId: string | undefined = undefined, displayName: string | undefined = undefined)
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
            displayName: displayName || typeIdToDisplayName(newTypeId),
            placeableData: null,
            selectableData: null,
            interactableData: null,
            foodData: null
        };
    } else if (displayName) {
        gameObj.displayName = displayName;
    } else if (!gameObj.displayName) {
        gameObj.displayName = typeIdToDisplayName(gameObj.typeId);
    }

    gameObj.placeableData = {
        lastPlaceObjectPos : [],
        placedObject: [],
        ...data
    }

    obj.userData = gameObj;
}

function makeInteractable(obj: THREE.Object3D, data: InteractableUserData, newTypeId: string | undefined = undefined, displayName: string | undefined = undefined)
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
            displayName: displayName || typeIdToDisplayName(newTypeId),
            placeableData: null,
            selectableData: null,
            interactableData: null,
            foodData: null
        };
    } else if (displayName) {
        gameObj.displayName = displayName;
    } else if (!gameObj.displayName) {
        gameObj.displayName = typeIdToDisplayName(gameObj.typeId);
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
        case "KeyE":
            if (isRecipeOpen) {
                recipeDiv.style.display = 'none';
                isRecipeOpen = false;
                pointerLockControls.lock(); 
                
                loadAndPlaySound('./sounds/aud_paper_close_0.mp3', 0.3);
            } else {
                recipeDiv.style.display = 'block';
                isRecipeOpen = true;
                pointerLockControls.unlock();

                loadAndPlaySound('./sounds/aud_paper_0.mp3', 0.3);
            }
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
            pointerLockControls.moveForward(speed * deltaTime);
        }
        if (controls.moveBackward) {
            pointerLockControls.moveForward(-speed * deltaTime);
        }
        if (controls.moveLeft) {
            pointerLockControls.moveRight(-speed * deltaTime);
        }
        if (controls.moveRight) {
            pointerLockControls.moveRight(speed * deltaTime);
        }
        if (controls.moveUp) {
            camera.position.y += speed * deltaTime;
        }
        if (controls.moveDown) {
            camera.position.y -= speed * deltaTime;
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
        'foodData' in data &&
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


function setupLoadingUI() {
    loadingScreenDiv = document.createElement('div');
    loadingScreenDiv.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-color: #1a1a1a;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        z-index: 9999; /* Paling atas */
        transition: opacity 0.5s;
    `;

    loadingTextDiv = document.createElement('div');
    loadingTextDiv.innerText = "Initializing...";
    loadingTextDiv.style.cssText = `
        color: #ffffff;
        font-family: monospace;
        font-size: 20px;
        margin-bottom: 15px;
        letter-spacing: 2px;
    `;
    loadingScreenDiv.appendChild(loadingTextDiv);

    progressBarContainer = document.createElement('div');
    progressBarContainer.style.cssText = `
        width: 300px;
        height: 20px;
        background-color: #333;
        border: 2px solid #555;
        border-radius: 10px;
        overflow: hidden;
    `;
    loadingScreenDiv.appendChild(progressBarContainer);

    progressBarFill = document.createElement('div');
    progressBarFill.style.cssText = `
        width: 0%;
        height: 100%;
        background-color: #4caf50;
        transition: width 0.2s;
    `;
    progressBarContainer.appendChild(progressBarFill);

    document.body.appendChild(loadingScreenDiv);
}

init();