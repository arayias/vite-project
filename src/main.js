import "./style.css";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { gsap } from "gsap";

// ------------------- SCENE SETUP --------------------

const scene = new THREE.Scene();
const state = {
  cubes: [],
};

const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.z = 7;

const renderer = new THREE.WebGLRenderer({
  canvas: document.getElementById("canvas"),
  antialias: true,
});
renderer.setSize(window.innerWidth / 2, window.innerHeight / 2);
renderer.setPixelRatio(window.devicePixelRatio);

// Orbit controls to look around
const controls = new OrbitControls(camera, renderer.domElement);

// A bit of light
const light = new THREE.DirectionalLight(0xffffff, 1);
light.position.set(5, 5, 5);
scene.add(light);

// ------------------- COLOR DEFINITIONS --------------------

const RED = 0xff0000;
const GREEN = 0x00ff00;
const BLUE = 0x0000ff;
const WHITE = 0xffffff;
const YELLOW = 0xffff00;
const ORANGE = 0xffa500;

// Map each “Rubik’s color” to a 4‐bit code (0..5 fits easily in 4 bits)
const COLOR_TO_NIBBLE = {
  [WHITE]: 0, // white  -> 0000
  [ORANGE]: 1, // orange -> 0001
  [GREEN]: 2, // green  -> 0010
  [RED]: 3, // red    -> 0011
  [BLUE]: 4, // blue   -> 0100
  [YELLOW]: 5, // yellow -> 0101
};

// Invert that map for converting back
const NIBBLE_TO_COLOR = {
  0: WHITE, // white
  1: ORANGE, // orange
  2: GREEN, // green
  3: RED, // red
  4: BLUE, // blue
  5: YELLOW, // yellow
};

// ------------------- INITIAL FACE COLORS (3×3 arrays) --------------------
// We'll store each face as a 3×3 of raw Three.js color codes
// in the usual order: U, R, F, D, L, B.
const faceColors = {
  U: [
    [WHITE, WHITE, WHITE],
    [WHITE, WHITE, WHITE],
    [WHITE, WHITE, WHITE],
  ],
  R: [
    [RED, RED, RED],
    [RED, RED, RED],
    [RED, RED, RED],
  ],
  F: [
    [GREEN, GREEN, GREEN],
    [GREEN, GREEN, GREEN],
    [GREEN, GREEN, GREEN],
  ],
  D: [
    [YELLOW, YELLOW, YELLOW],
    [YELLOW, YELLOW, YELLOW],
    [YELLOW, YELLOW, YELLOW],
  ],
  L: [
    [ORANGE, ORANGE, ORANGE],
    [ORANGE, ORANGE, ORANGE],
    [ORANGE, ORANGE, ORANGE],
  ],
  B: [
    [BLUE, BLUE, BLUE],
    [BLUE, BLUE, BLUE],
    [BLUE, BLUE, BLUE],
  ],
};

// ------------------- FACE <-> UINT32 HELPERS --------------------

/**
 * Convert a 3×3 face (ignoring the center piece in terms of movement)
 * into a single 32-bit integer with 8 nibbles (4 bits each).
 *
 * Our clockwise nibble-indexing is:
 *   corner=0, edge=1, corner=2,
 *              edge=3,
 *   corner=4, edge=5, corner=6,
 *              edge=7
 */
function face3x3ToUint32(face3x3) {
  // Gather the 8 “movable” squares (corners + edges) in a ring:
  //   -> -> ->
  //          |
  //   ^      v
  //   |      |
  //   <- <- v
  //
  const cornersEdges = [
    face3x3[0][0], // nibble 0
    face3x3[0][1], // nibble 1
    face3x3[0][2], // nibble 2
    face3x3[1][2], // nibble 3
    face3x3[2][2], // nibble 4
    face3x3[2][1], // nibble 5
    face3x3[2][0], // nibble 6
    face3x3[1][0], // nibble 7
  ];

  let faceInt = 0 >>> 0;
  for (let i = 0; i < 8; i++) {
    const nib = COLOR_TO_NIBBLE[cornersEdges[i]];
    // Shift nibble i into bits (4 * i).
    faceInt |= (nib & 0xf) << (4 * i);
  }
  return faceInt >>> 0;
}

/**
 * Convert back from a 32-bit face into a 3×3 color array,
 * placing the 8 corner/edge squares in the correct positions.
 * (We skip the center color or fill it arbitrarily.)
 */
function uint32ToFace3x3(faceInt) {
  const face3x3 = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  for (let i = 0; i < 8; i++) {
    const nib = (faceInt >>> (4 * i)) & 0xf;
    const color = NIBBLE_TO_COLOR[nib];
    switch (i) {
      case 0:
        face3x3[0][0] = color;
        break;
      case 1:
        face3x3[0][1] = color;
        break;
      case 2:
        face3x3[0][2] = color;
        break;
      case 3:
        face3x3[1][2] = color;
        break;
      case 4:
        face3x3[2][2] = color;
        break;
      case 5:
        face3x3[2][1] = color;
        break;
      case 6:
        face3x3[2][0] = color;
        break;
      case 7:
        face3x3[1][0] = color;
        break;
    }
  }
  // The center doesn't move, so fill it with whatever you want:
  face3x3[1][1] = face3x3[1][1] || WHITE;
  return face3x3;
}

/**
 * Circular-rotate the ring of 8 nibbles in `faceInt` by `shiftCount`.
 * E.g. a +2 shift corresponds to a 90° clockwise turn in our indexing.
 */
function rotateFaceNibbles(faceInt, shiftCount) {
  shiftCount = ((shiftCount % 8) + 8) % 8; // ensure positive
  let result = 0 >>> 0;
  for (let i = 0; i < 8; i++) {
    const oldNib = (faceInt >>> (4 * i)) & 0xf;
    const newPos = (i + shiftCount) % 8;
    result |= oldNib << (4 * newPos);
  }
  return result >>> 0;
}

/**
 * Grab a specified set of nibble indices from a faceInt (returns them as an array).
 */
function getNibbles(faceInt, indices) {
  return indices.map((i) => (faceInt >>> (4 * i)) & 0xf);
}

/**
 * Write an array of nibble values back into specific indices of a faceInt.
 */
function setNibblesInFaceInt(faceInt, indices, nibbleValues) {
  let result = faceInt >>> 0;
  for (let i = 0; i < indices.length; i++) {
    const pos = indices[i];
    const val = nibbleValues[i] & 0xf;
    // zero out that nibble:
    result &= ~(0xf << (4 * pos));
    // set the new nibble:
    result |= val << (4 * pos);
  }
  return result >>> 0;
}

// ------------------- CREATE THE 6 FACE-INTS --------------------
// We'll store them in an array [U, R, F, D, L, B], indexes 0..5
let faceInts = new Uint32Array(6);

faceInts[0] = face3x3ToUint32(faceColors.U); // U
faceInts[1] = face3x3ToUint32(faceColors.R); // R
faceInts[2] = face3x3ToUint32(faceColors.F); // F
faceInts[3] = face3x3ToUint32(faceColors.D); // D
faceInts[4] = face3x3ToUint32(faceColors.L); // L
faceInts[5] = face3x3ToUint32(faceColors.B); // B

// ------------------- SYNC BACK TO 3D MODEL --------------------
// NOT USED

/**
 * Convert all 6 faceInts back to faceColors[U,R,F,D,L,B],
 * then repaint each miniature cube’s MeshBasicMaterial.
 */
function update3dColorsFromFaceInts() {
  faceColors.U = uint32ToFace3x3(faceInts[0]);
  faceColors.R = uint32ToFace3x3(faceInts[1]);
  faceColors.F = uint32ToFace3x3(faceInts[2]);
  faceColors.D = uint32ToFace3x3(faceInts[3]);
  faceColors.L = uint32ToFace3x3(faceInts[4]);
  faceColors.B = uint32ToFace3x3(faceInts[5]);

  // Now update the meshes
  state.cubes.forEach((cube) => {
    // i, j, k from the mini-cube’s position
    const i = Math.round(cube.position.x);
    const j = Math.round(cube.position.y);
    const k = Math.round(cube.position.z);

    // Build fresh materials for each face of the mini-cube:
    const materials = [
      new THREE.MeshBasicMaterial({ color: 0x333333 }), // +X (Right)
      new THREE.MeshBasicMaterial({ color: 0x333333 }), // -X (Left)
      new THREE.MeshBasicMaterial({ color: 0x333333 }), // +Y (Up)
      new THREE.MeshBasicMaterial({ color: 0x333333 }), // -Y (Down)
      new THREE.MeshBasicMaterial({ color: 0x333333 }), // +Z (Front)
      new THREE.MeshBasicMaterial({ color: 0x333333 }), // -Z (Back)
    ];

    // We’ll reuse the same “row/col” functions you had
    if (i === +1) {
      const { row, col } = getRightFaceRowCol(i, j, k);
      materials[0].color.set(faceColors.R[row][col]);
    }
    if (i === -1) {
      const { row, col } = getLeftFaceRowCol(i, j, k);
      materials[1].color.set(faceColors.L[row][col]);
    }
    if (j === +1) {
      const { row, col } = getUpFaceRowCol(i, j, k);
      materials[2].color.set(faceColors.U[row][col]);
    }
    if (j === -1) {
      const { row, col } = getDownFaceRowCol(i, j, k);
      materials[3].color.set(faceColors.D[row][col]);
    }
    if (k === +1) {
      const { row, col } = getFrontFaceRowCol(i, j, k);
      materials[4].color.set(faceColors.F[row][col]);
    }
    if (k === -1) {
      const { row, col } = getBackFaceRowCol(i, j, k);
      materials[5].color.set(faceColors.B[row][col]);
    }

    cube.material = materials;
  });
}

// ------------------- HELPER: ROW/COL MAPPINGS --------------------
// These match your original indexing logic for each face:

function getRightFaceRowCol(i, j, k) {
  // +X => Right face
  // row = -(j - 1), col = k + 1
  return { row: -(j - 1), col: k + 1 };
}

function getLeftFaceRowCol(i, j, k) {
  // -X => Left face
  // row = -(j - 1), col = 2 - (k + 1)
  return { row: -(j - 1), col: 2 - (k + 1) };
}

function getUpFaceRowCol(i, j, k) {
  // +Y => Up face
  // row = -(k - 1), col = i + 1
  return { row: -(k - 1), col: i + 1 };
}

function getDownFaceRowCol(i, j, k) {
  // -Y => Down face
  // row = k + 1, col = i + 1
  return { row: k + 1, col: i + 1 };
}

function getFrontFaceRowCol(i, j, k) {
  // +Z => Front face
  // row = -(j - 1), col = i + 1
  return { row: -(j - 1), col: i + 1 };
}

function getBackFaceRowCol(i, j, k) {
  // -Z => Back face
  // row = -(j - 1), col = 2 - (i + 1)
  return { row: -(j - 1), col: 2 - (i + 1) };
}

// ------------------- BUILD THE 26 MINI-CUBES --------------------

for (let i = -1; i < 2; i++) {
  for (let j = -1; j < 2; j++) {
    for (let k = -1; k < 2; k++) {
      // skip the hidden center piece
      if (i === 0 && j === 0 && k === 0) continue;

      // Just under 1x1x1 so there's a little gap
      const s = 0.98;
      const geometry = new THREE.BoxGeometry(s, s, s);

      // Default gray for all 6 faces initially
      const materials = [
        new THREE.MeshBasicMaterial({ color: 0x333333 }),
        new THREE.MeshBasicMaterial({ color: 0x333333 }),
        new THREE.MeshBasicMaterial({ color: 0x333333 }),
        new THREE.MeshBasicMaterial({ color: 0x333333 }),
        new THREE.MeshBasicMaterial({ color: 0x333333 }),
        new THREE.MeshBasicMaterial({ color: 0x333333 }),
      ];

      // Paint the sticker if it's on an outer face:
      if (i === +1) {
        const { row, col } = getRightFaceRowCol(i, j, k);
        materials[0].color.set(faceColors.R[row][col]);
      }
      if (i === -1) {
        const { row, col } = getLeftFaceRowCol(i, j, k);
        materials[1].color.set(faceColors.L[row][col]);
      }
      if (j === +1) {
        const { row, col } = getUpFaceRowCol(i, j, k);
        materials[2].color.set(faceColors.U[row][col]);
      }
      if (j === -1) {
        const { row, col } = getDownFaceRowCol(i, j, k);
        materials[3].color.set(faceColors.D[row][col]);
      }
      if (k === +1) {
        const { row, col } = getFrontFaceRowCol(i, j, k);
        materials[4].color.set(faceColors.F[row][col]);
      }
      if (k === -1) {
        const { row, col } = getBackFaceRowCol(i, j, k);
        materials[5].color.set(faceColors.B[row][col]);
      }

      const cube = new THREE.Mesh(geometry, materials);
      cube.position.set(i, j, k);

      state.cubes.push(cube);
      scene.add(cube);
    }
  }
}

// ------------------- 3D ROTATION ANIMATION --------------------
let isRotating = false;

function rotateLayer3D(
  axis,
  val,
  clockwise,
  inverted,
  onComplete,
  duration = 0.25
) {
  // Example: if axis='y' and val=+1 => rotate the top layer
  // Gather the cubes with position[axis] ~ val
  isRotating = true;
  const cubesToRotate = findAllCubesOnAxis(axis, val);

  // compute pivot
  const pivot = new THREE.Vector3();
  cubesToRotate.forEach((c) => pivot.add(c.position));
  pivot.divideScalar(cubesToRotate.length);

  const group = new THREE.Group();
  group.position.copy(pivot);
  scene.add(group);

  // re-parent them to the group
  cubesToRotate.forEach((cube) => {
    scene.remove(cube);
    cube.position.sub(pivot);
    group.add(cube);
  });

  // rotate group with gsap
  let targetRotation = { x: 0, y: 0, z: 0 };
  if (axis === "x") targetRotation.x = (Math.PI / 2) * (clockwise ? 1 : -1);
  if (axis === "y") targetRotation.y = (Math.PI / 2) * (clockwise ? 1 : -1);
  if (axis === "z") targetRotation.z = (Math.PI / 2) * (clockwise ? 1 : -1);

  gsap.to(group.rotation, {
    x: targetRotation.x,
    y: targetRotation.y,
    z: targetRotation.z,
    duration,
    ease: "power2.inOut",
    onComplete: () => {
      // re-parent back
      cubesToRotate.forEach((cube) => {
        cube.updateMatrixWorld();
        cube.position.applyEuler(group.rotation);
        cube.position.add(pivot);
        // also rotate orientation
        const q = new THREE.Quaternion().setFromEuler(group.rotation);
        cube.quaternion.premultiply(q);

        group.remove(cube);
        scene.add(cube);
      });
      scene.remove(group);
      isRotating = false;
      if (onComplete) onComplete();
    },
  });
}

function findAllCubesOnAxis(axis, val) {
  const out = [];
  state.cubes.forEach((cube) => {
    // tolerance of 1e-3 is a bit arbitrary
    if (Math.abs(cube.position[axis] - val) < 1e-3) {
      out.push(cube);
    }
  });
  return out;
}

// Face indexes: 0=U, 1=R, 2=F, 3=D, 4=L, 5=B
// Nibble ring on each face is 0..7 as:
//   0 --- 1 --- 2
//   |           |
//   7           3
//   |           |
//   6 --- 5 --- 4

let moveMap = {
  // ==================
  // U move
  // ==================
  u: {
    axis: "y",
    dir: +1, // We'll rotate layer y=+1
    clockwise: false,
    mainFace: 0, // = U
    ringShift: +2, // rotate Face U by +2 nibbles
    edges: [
      { face: 2, row: [0, 1, 2] }, // top row of F
      { face: 4, row: [0, 1, 2] }, // top row of L
      { face: 5, row: [0, 1, 2] }, // top row of B
      { face: 1, row: [0, 1, 2] }, // top row of R
    ],
  },

  // ==================
  // D move
  // ==================
  d: {
    axis: "y",
    dir: -1,
    clockwise: true,
    mainFace: 3, // D
    ringShift: +2, // rotate Face D by +2
    edges: [
      // cycle: F -> L -> B -> R -> F   (check orientation carefully)
      { face: 2, row: [4, 5, 6] }, // bottom row of F
      { face: 1, row: [4, 5, 6] }, // bottom row of R
      { face: 5, row: [4, 5, 6] }, // bottom row of B
      { face: 4, row: [4, 5, 6] }, // bottom row of L
    ],
  },

  // ==================
  // L move
  // ==================
  l: {
    axis: "x",
    dir: -1,
    clockwise: true,
    mainFace: 4, // L
    ringShift: +2,
    edges: [
      // cycle: U -> B -> D -> F -> U
      { face: 0, row: [6, 7, 0] }, // left column of U
      { face: 2, row: [6, 7, 0] }, // left column of F
      { face: 3, row: [6, 7, 0] }, // left column of D
      { face: 5, row: [2, 3, 4] }, // right column of B
    ],
  },

  // ==================
  // R move
  // ==================
  r: {
    axis: "x",
    dir: +1,
    clockwise: false,
    mainFace: 1, // R
    ringShift: +2,
    edges: [
      // cycle: U -> F -> D -> B -> U
      { face: 0, row: [2, 3, 4] }, // right column of U
      { face: 5, row: [6, 7, 0] }, // left column of B
      { face: 3, row: [2, 3, 4] }, // right column of D
      { face: 2, row: [2, 3, 4] }, // right column of F
    ],
  },

  // ==================
  // F move
  // ==================
  f: {
    axis: "z",
    dir: +1,
    clockwise: false, // typical F is “clockwise” when viewed from the front
    mainFace: 2, // F
    ringShift: +2,
    edges: [
      // cycle: U(bottom) -> R(left) -> D(top) -> L(right) -> U(bottom)
      { face: 0, row: [4, 5, 6] }, // bottom row of U
      { face: 1, row: [6, 7, 0] }, // left column of R
      { face: 3, row: [0, 1, 2] }, // top row of D
      { face: 4, row: [2, 3, 4] }, // right column of L
    ],
  },

  // ==================
  // B move
  // ==================
  b: {
    axis: "z",
    dir: -1,
    clockwise: true,
    mainFace: 5, // B
    ringShift: +2,
    edges: [
      // cycle: U(top) -> L(left) -> D(bottom) -> R(right) -> U(top)
      { face: 0, row: [0, 1, 2] }, // top row of U
      { face: 4, row: [6, 7, 0] }, // left column of L
      { face: 3, row: [4, 5, 6] }, // bottom row of D
      { face: 1, row: [2, 3, 4] }, // right column of R
    ],
  },
};

function rotate(move) {
  // Destructure the move:
  const { axis, dir, clockwise, mainFace, ringShift, edges } = move;

  // 1) Rotate the main face’s ring of 8 nibbles by ±2 (quarter turn)
  //    E.g. +2 for a clockwise quarter-turn, -2 for CCW, etc.
  //    (We can flip sign if your code uses "Shift" = inverted, etc.)
  const actualShift = inverted ? -ringShift : ringShift;
  faceInts[mainFace] = rotateFaceNibbles(faceInts[mainFace], actualShift);

  // 2) Cycle the edges among faces.  We’ll do a ring shift in the array:
  //    edges[0] -> edges[1], edges[1] -> edges[2], etc.
  //    This order assumes your "clockwise" means edges[0] goes to edges[1].
  //    If you want to reverse that on Shift or CCW, you can reverse the array first.
  let buffers = edges.map(({ face, row }) => {
    return getNibbles(faceInts[face], row);
  });

  const directionSign = inverted ? -1 : +1;

  for (let i = 0; i < edges.length; i++) {
    let srcIndex = i;
    let dstIndex = (i + directionSign + edges.length) % edges.length;
    let { face: dstFace, row: dstRow } = edges[dstIndex];

    faceInts[dstFace] = setNibblesInFaceInt(
      faceInts[dstFace],
      dstRow,
      buffers[srcIndex]
    );
  }

  // 3) Animate the layer of mini-cubes in 3D
  //    If "inverted" is true, we can flip the direction of the spin in 3D:
  rotateLayer3D(axis, dir, inverted ? !clockwise : clockwise);
}

// ------------------- KEYBOARD --------------------

let inverted = false;

document.addEventListener("keydown", (e) => {
  if (e.key.toLowerCase() === "shift") {
    inverted = true;
  }
});

document.addEventListener("keyup", (e) => {
  if (e.key.toLowerCase() === "shift") {
    inverted = false;
  }
});

document.addEventListener("keydown", (e) => {
  if (isRotating) return; // ignore if a turn is in progress

  let key = e.key.toLowerCase();
  if (moveMap.hasOwnProperty(key)) {
    const move = moveMap[key];
    console.log("Before move:", faceInts);
    rotate(move);
    renderCubeMap();
    console.log("After move:", faceInts);
  } else {
    console.log("Invalid move:", key);
  }
});

function renderCubeMap() {
  // convert faceInts to a cell array
  let order = ["up", "right", "front", "down", "left", "back"];
  for (let [idx, face] of faceInts.entries()) {
    let arr = uint32ToFace3x3(face);
    let el = document.querySelector(`#face-${order[idx]}`);
    for (let [ydx, colour] of arr.flat().entries()) {
      let color = el.querySelector(`#face-color-${ydx}`);
      if (ydx === 4) {
        // middle cubes
        let c = faceColors[order[idx].toUpperCase().slice(0, 1)].flat()[ydx];
        console.log(c);
        color.style.backgroundColor = `#${c.toString(16).padStart(6, "0")}`;
        continue;
      }
      let hexColor = `#${colour.toString(16).padStart(6, "0")}`;
      color.style.backgroundColor = hexColor;
    }
  }
}

// ------------------- RENDER LOOP --------------------
function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}
animate();
