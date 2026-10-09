import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

// Models are meshopt-compressed with WebP textures (gltf-transform optimize).
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const cache = new Map<string, ReturnType<typeof loader.loadAsync>>();

export function loadModel(name: string) {
  let p = cache.get(name);
  if (!p) {
    p = loader.loadAsync(`${import.meta.env.BASE_URL}models/${name}.glb`);
    cache.set(name, p);
  }
  return p;
}
