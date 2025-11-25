import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';

const gltfLoader = new GLTFLoader().setPath('models/');
const fbxLoader = new FBXLoader().setPath('models/').setResourcePath("models/");
const objLoader = new OBJLoader().setPath('models/');
const mtlLoader = new MTLLoader().setPath('models/');

export async function loadGLTF(path: string)
{
    const obj = await gltfLoader.loadAsync(path)

    obj.scene.traverse((child: any) =>
    {
        if (child.isMesh)
        {
            child.castShadow = true;
            child.receiveShadow = true;
        }
    });

    return obj.scene;
}

export async function loadFBX(path: string)
{
    const obj = await fbxLoader.loadAsync(path);

    obj.traverse((child: any) =>
    {
        if (child.isMesh)
        {
            child.castShadow = true;
            child.receiveShadow = true;
        }
    });

    return obj;
}

export async function loadOBJ(objPath: string, mtlPath: string)
{
    const mtl = await mtlLoader.loadAsync(mtlPath);
    mtl.preload();

    objLoader.setMaterials(mtl);
    const obj = await objLoader.loadAsync(objPath);

    obj.traverse((child: any) =>
    {
        if (child.isMesh)
        {
            child.castShadow = true;
            child.receiveShadow = true;
        }
    });

    return obj;
}