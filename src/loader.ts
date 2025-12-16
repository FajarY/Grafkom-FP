import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js'

const gltfLoader = new GLTFLoader().setPath('models/');
const fbxLoader = new FBXLoader().setPath('models/').setResourcePath("models/");

const modelCache = new Map();

const gltfPathsToLoad = [
    'meja.glb',
    'stove.glb',
    'api-kompor.glb',
    'source/ayamfilet.glb',
    'source/ayamdadu.glb',
    'pisau.glb',
    'piring.glb',
    'source/kubis.glb',
    'source/kubis-potong.glb',
    'talenan.glb',
    'lumpia-single.glb',
    'kulit-lumpia-banyak.glb',
    'kulit-lumpia-single.glb',
    'liquid.glb',
    'liquid-solid.glb',
    'wajan-flat.glb',
    'botol.glb',
    'santan.glb',
    'bumbu.glb',
    'piring.glb',
    'mangga_pohon.glb',
    'alt_mangga_pohon.glb',
    'kacangpanjang.glb',
    'parutan-kelapa.glb',
    'coconut_flakes.glb',
    'bumbugenep.glb',
    'kacangpanjangpotong.glb',
    'kacangpanjangpotongbanyak.glb',
    'lawar.glb'
];
const fbxPathsToLoad = [
    'daging-kecil-banyak.fbx',
    'wajan.fbx',
    'wortel.fbx',
    'potongan wortel.fbx',
    'wajan-flat.fbx',
    'daging.fbx',
    'daging-kecil.fbx',
    'gunung.fbx',
    'kelapa.fbx'
]

export async function loadModelsFromPathsCache()
{
    for(let i = 0; i < gltfPathsToLoad.length; i++)
    {
        await loadGLTFToCache(gltfPathsToLoad[i]);
    }
    for(let i = 0; i < fbxPathsToLoad.length; i++)
    {
        await loadFBXToCache(fbxPathsToLoad[i]);
    }
}
export async function loadGLTFToCache(path: string)
{
    const obj = await gltfLoader.loadAsync(path)

    if(!obj)
    {
        throw new Error(`Failed when loading gltf of ${path}`);
    }

    obj.scene.traverse((child: any) =>
    {
        if (child.isMesh)
        {
            child.castShadow = true;
            child.receiveShadow = true;
        }
    });

    const realObj = obj.scene;

    modelCache.set(path, realObj);
}
export async function loadFBXToCache(path: string)
{
    const obj = await fbxLoader.loadAsync(path);

    if(!obj)
    {
        throw new Error(`Failed when loading fbx of ${path}`);
    }

    obj.traverse((child: any) =>
    {
        if (child.isMesh)
        {
            child.castShadow = true;
            child.receiveShadow = true;
        }
    });

    modelCache.set(path, obj);
}

export function loadModel(path: string, castShadow?: boolean)
{
    if(!modelCache.has(path))
    {
        throw new Error(`Model is not loaded on the cache, please add ${path} to the cache first!`);
    }

    const obj = modelCache.get(path);

    const cloned = SkeletonUtils.clone(obj);
    cloned.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh;
            if (Array.isArray(mesh.material)) {
                mesh.material = mesh.material.map(m => {
                    const mat = m.clone();
                    const forceMat = mat as any;
                    mat.userData = {
                        originalColor: forceMat.color.clone()
                    };

                    return forceMat;
                });
            } else if (mesh.material) {
                mesh.material = mesh.material.clone();
                const forceMat = mesh.material as any;
                mesh.material.userData = {
                    originalColor: forceMat.color.clone()
                }
            }
        }
    });

    if(castShadow !== undefined)
    {
        cloned.traverse((child: any) =>
        {
            if (child.isMesh)
            {
                child.castShadow = castShadow;
                child.receiveShadow = castShadow;
            }
        });
    }
    return cloned;
}