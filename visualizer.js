class Visualizer {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, this.container.clientWidth / this.container.clientHeight, 0.1, 1000);
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        
        this.stackItems = [];
        this.heapItems = new Map();
        this.connections = [];

        this.init();
    }

    init() {
        // Ensure container has dimensions
        const width = this.container.clientWidth || 800;
        const height = this.container.clientHeight || 600;
        
        this.renderer.setSize(width, height);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.container.appendChild(this.renderer.domElement);

        // Update camera aspect
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();

        // Lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        this.scene.add(ambientLight);

        const pointLight = new THREE.PointLight(0x00f2ff, 1);
        pointLight.position.set(5, 5, 5);
        this.scene.add(pointLight);

        // Grid Floor (Heap representation)
        const gridHelper = new THREE.GridHelper(20, 20, 0x00f2ff, 0x161821);
        gridHelper.position.y = -2;
        this.scene.add(gridHelper);

        this.camera.position.set(10, 10, 15);
        this.camera.lookAt(0, 0, 0);

        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;

        this.animate();

        window.addEventListener('resize', () => this.onWindowResize());
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }

    onWindowResize() {
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;
        if (width === 0 || height === 0) return;

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }

    /**
     * Clear and rebuild the scene based on a list of snapshots up to an index
     */
    reconstruct(snapshots, index) {
        this.reset();
        for (let i = 0; i <= index; i++) {
            this.applySnapshot(snapshots[i], false); // Don't animate during reconstruction
        }
    }

    /**
     * Apply a single snapshot to the current scene
     */
    applySnapshot(snapshot, animate = true) {
        const { line, action } = snapshot;

        if (action.startsWith('Enter')) {
            this.pushStack(action.replace('Enter ', ''), animate);
        } else if (action.startsWith('Call')) {
            this.pushStack(action.replace('Call ', ''), animate);
        } else if (action.startsWith('Assign') || action.startsWith('Update')) {
            const parts = action.split(' ');
            const name = parts[1];
            this.updateHeap(name, Math.random() * 10, animate);
        }
    }

    pushStack(name, animate = true) {
        const geometry = new THREE.BoxGeometry(4, 0.8, 4);
        const material = new THREE.MeshPhongMaterial({ 
            color: this.stackItems.length % 2 === 0 ? 0x7000ff : 0x9d50ff, 
            transparent: true, 
            opacity: 0.7,
            shininess: 100 
        });
        const box = new THREE.Mesh(geometry, material);
        
        const yPos = this.stackItems.length * 1.0;
        box.position.set(0, yPos, 0);
        
        this.scene.add(box);
        this.stackItems.push(box);

        if (animate) {
            box.scale.set(0, 0, 0);
            gsap.to(box.scale, { x: 1, y: 1, z: 1, duration: 0.4, ease: "back.out(1.7)" });
        }
    }

    updateHeap(name, value, animate = true) {
        if (!this.heapItems.has(name)) {
            const geometry = new THREE.BoxGeometry(1, 1, 1);
            const material = new THREE.MeshPhongMaterial({ 
                color: 0x00f2ff,
                emissive: 0x00f2ff,
                emissiveIntensity: 0.2
            });
            const cube = new THREE.Mesh(geometry, material);
            
            // Grid-like positioning
            const count = this.heapItems.size;
            const row = Math.floor(count / 5);
            const col = count % 5;
            
            cube.position.set(
                (col - 2) * 2,
                -1.5,
                (row + 2) * 2
            );
            
            this.scene.add(cube);
            this.heapItems.set(name, cube);
            
            if (animate) {
                cube.scale.set(0, 0, 0);
                gsap.to(cube.scale, { x: 1, y: 1, z: 1, duration: 0.5, ease: "elastic.out(1, 0.5)" });
            }
        } else {
            const cube = this.heapItems.get(name);
            if (animate) {
                gsap.to(cube.rotation, { y: cube.rotation.y + Math.PI, duration: 0.5 });
                gsap.to(cube.scale, { x: 1.2, y: 1.2, z: 1.2, duration: 0.1, yoyo: true, repeat: 1 });
            }
        }
    }

    reset() {
        this.stackItems.forEach(item => this.scene.remove(item));
        this.heapItems.forEach(item => this.scene.remove(item));
        this.stackItems = [];
        this.heapItems.clear();
    }
}
