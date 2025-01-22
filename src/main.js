import "./style.css";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { gsap } from "gsap";

// scene
const scene = new THREE.Scene();
const state = {
  cubes: {
    x: [[], [], []],
    y: [[], [], []],
    z: [[], [], []],
  },
};

// camera
const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.z = 5;

const renderer = new THREE.WebGLRenderer({
  canvas: document.getElementById("canvas"),
  antialias: true,
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);

// controls
const controls = new OrbitControls(camera, renderer.domElement);

// light
const light = new THREE.DirectionalLight(0xffffff, 1);
light.position.set(5, 5, 5);
scene.add(light);

// Function to create debug texture
function createDebugTexture(idx) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d");

  // Fill background
  context.fillStyle = "white";
  context.fillRect(0, 0, canvas.width, canvas.height);

  // Draw text
  context.fillStyle = "black";
  context.font = "48px Arial";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(`[${idx.join(",")}]`, canvas.width / 2, canvas.height / 2);

  return new THREE.CanvasTexture(canvas);
}

// geometry
for (let i = -1; i < 2; i++) {
  for (let j = -1; j < 2; j++) {
    for (let k = -1; k < 2; k++) {
      // skip inside faces
      if (i == 0 && j == 0 && k == 0) continue;

      const s = 1.95;
      const geometry = new THREE.BoxGeometry(s, s, s);
      const idx = [i, j, k];

      // Create materials for each face with debug texture
      const materials = [];
      for (let face = 0; face < 6; face++) {
        // const texture = createDebugTexture(idx);
        // const material = new THREE.MeshPhongMaterial({
        //   map: texture,
        //   flatShading: true,
        //   shininess: 0,
        // });
        // material to show different sides
        const material = new THREE.MeshNormalMaterial({
          // color: 0xffffff,
          // map: texture,
          // flatShading: true,
          // shininess: 0,
          // transparent: true,
          // wireframe: true,
        });
        material.userData.idx = idx;
        materials.push(material);
      }

      const cube = new THREE.Mesh(geometry, materials);
      cube.position.set(i * 2 - 3, j * 2 - 3, k * 2 - 3);

      state.cubes.x[i + 1].push(cube);
      state.cubes.y[j + 1].push(cube);
      state.cubes.z[k + 1].push(cube);

      scene.add(cube);
    }
  }
}

// types of rotations
// u, d, l, r, f, b
let isRotating = false;
function rotate(axis, amount, duration) {
  // duration in seconds
  isRotating = true;
  const [x, y, z] = axis;
  console.log("Axis:", x, y, z);

  let selectedAxis = null;
  let idx = null;

  if (x !== 0) {
    selectedAxis = "x";
    idx = x;
  } else if (y !== 0) {
    selectedAxis = "y";
    idx = y;
  } else if (z !== 0) {
    selectedAxis = "z";
    idx = z;
  }

  console.log("Selected Axis and Index:", selectedAxis, idx);

  if (!selectedAxis || idx === null) {
    console.warn("No valid axis selected for rotation.");
    return;
  }

  const cubesToRotate = state.cubes[selectedAxis][idx + 1];

  if (!cubesToRotate || cubesToRotate.length === 0) {
    console.warn("No cubes found to rotate.");
    return;
  }

  // calculate the pivot point (center of selected cubes)
  const pivot = new THREE.Vector3(0, 0, 0);
  cubesToRotate.forEach((cube) => {
    pivot.add(cube.position);
  });
  pivot.divideScalar(cubesToRotate.length);

  const group = new THREE.Group();
  group.position.copy(pivot);
  scene.add(group);

  cubesToRotate.forEach((cube) => {
    scene.remove(cube);

    const relativePosition = cube.position.clone().sub(pivot);
    cube.position.copy(relativePosition);

    group.add(cube);
  });

  let targetRotation = { x: 0, y: 0, z: 0 };
  if (x !== 0) {
    targetRotation.x = amount;
  } else if (y !== 0) {
    targetRotation.y = amount;
  } else if (z !== 0) {
    targetRotation.z = amount;
  }

  // smoothening
  const rotationProps = {};
  if (x !== 0) rotationProps.rotationX = group.rotation.x + targetRotation.x;
  if (y !== 0) rotationProps.rotationY = group.rotation.y + targetRotation.y;
  if (z !== 0) rotationProps.rotationZ = group.rotation.z + targetRotation.z;

  gsap.to(group.rotation, {
    x:
      rotationProps.rotationX !== undefined
        ? rotationProps.rotationX
        : group.rotation.x,
    y:
      rotationProps.rotationY !== undefined
        ? rotationProps.rotationY
        : group.rotation.y,
    z:
      rotationProps.rotationZ !== undefined
        ? rotationProps.rotationZ
        : group.rotation.z,
    duration: duration,
    ease: "power2.inOut",
    onComplete: () => {
      cubesToRotate.forEach((cube) => {
        cube.position.applyEuler(group.rotation);
        cube.position.add(pivot);

        group.remove(cube);
        scene.add(cube);
      });
      scene.remove(group);

      isRotating = false;
    },
  });
}
const keys = {
  u: [0, 1, 0],
  d: [0, -1, 0],
  l: [-1, 0, 0],
  r: [1, 0, 0],
  f: [0, 0, 1],
  b: [0, 0, -1],
};

let inverted = false;
document.addEventListener("keydown", (e) => {
  const key = e.key.toLowerCase();
  if (key == "shift") {
    inverted = true;
  }
});

document.addEventListener("keyup", (e) => {
  const key = e.key.toLowerCase();
  if (key == "shift") {
    inverted = false;
  }
});

document.addEventListener("keydown", (e) => {
  if (isRotating) return;
  const key = e.key.toLowerCase();
  if (key in keys) {
    console.log(keys[key]);
    let angle = inverted ? -Math.PI / 2 : Math.PI / 2;
    rotate(keys[key], angle, 1);
  }
});

// animate
function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}
animate();

const resetButton = document.getElementById("app");
resetButton.addEventListener("click", () => {
  camera.position.set(0, 0, 5);
  controls.reset();
});
