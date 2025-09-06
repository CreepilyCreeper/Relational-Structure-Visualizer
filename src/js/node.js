import * as THREE from 'three';

class Node {
    constructor(personData, config = {}) {
        this.data = personData;
        this.mesh = null;
        this.position = new THREE.Vector3();
        this.textureLoader = new THREE.TextureLoader();
        this.config = {
            nodeSize: 0.1,
            glowEffect: false,
            ...config
        };
        this.originalScale = this.config.nodeSize;
        this.sprite = null; // <-- Add this line
        this.spriteScale = 5; // Default sprite scale
    }

    async createNode(allYears = null) {
        console.log(`Creating node for ${this.data.name}, selfie path: ${this.data.selfie}`);
        
        const geometry = new THREE.SphereGeometry(this.originalScale, 32, 32);
        const color = new THREE.Color(this.config.nodeColor);
        const material = new THREE.MeshBasicMaterial({
            color: color,
            transparent: false
        });
        this.mesh = new THREE.Mesh(geometry, material);
        
        // Only add glow effect if enabled in config
        if (this.config.glowEffect) {
            const glowGeometry = new THREE.SphereGeometry(this.originalScale * 1.2, 16, 16);
            const glowMaterial = new THREE.MeshBasicMaterial({
                color: color,
                transparent: true,
                opacity: 0.3,
                side: THREE.BackSide
            });
            
            const glowMesh = new THREE.Mesh(glowGeometry, glowMaterial);
            this.mesh.add(glowMesh);
        }
        
        // Add user data for interactions
        this.mesh.userData = {
            name: this.data.name,
            joinDate: this.data.joinDate,
            referrals: this.data.referrals || [],
            selfie: this.data.selfie,
            selfiecropped: this.data.selfiecropped,
            nodeInstance: this
        };
        
        // --- Add Sprite for Cropped Image with fallback ---
        if (this.data.selfiecropped && this.data.name) {
            // 1. Use a fallback texture first (solid color or default image)
            const fallbackTexture = new THREE.TextureLoader().load('./assets/selfies/fallback.png'); // or use a solid color canvas
            const spriteMaterial = new THREE.SpriteMaterial({depthTest: false });
            this.sprite = new THREE.Sprite(spriteMaterial);
            this.sprite.renderOrder = 999;
            // Start hidden if not in cropped mode
            const initialScale = (this.useCroppedImage ? this.spriteScale : 0);
            this.sprite.scale.set(this.originalScale * initialScale, this.originalScale * initialScale, 1);
            this.sprite.center.set(0.5, 0.5);
            this.sprite.visible = this.useCroppedImage;
            this.mesh.add(this.sprite);

            // Add user data to sprite for interactions
            this.sprite.userData = {
                name: this.data.name,
                joinDate: this.data.joinDate,
                referrals: this.data.referrals || [],
                selfie: this.data.selfie,
                selfiecropped: this.data.selfiecropped,
                nodeInstance: this
            };

            // 2. Load the real image in the background
            this.loadTexturePromise(this.data.selfiecropped)
                .then(texture => {
                    // 3. Swap in the real texture when loaded
                    this.sprite.material.map = texture;
                    this.sprite.material.needsUpdate = true;
                })
                .catch(() => {
                    // Optionally handle error (keep fallback)
                });
        }
        
        return this.mesh;
    }

    loadTexturePromise(path) {
        return new Promise((resolve, reject) => {
            this.textureLoader.load(
                path,
                (texture) => resolve(texture),
                undefined,
                (error) => reject(error)
            );
        });
    }

    update(newData) {
        this.data = newData;
        if (this.mesh) {
            this.mesh.userData = {
                name: this.data.name,
                joinDate: this.data.joinDate,
                referrals: this.data.referrals || [],
                selfie: this.data.selfie,
                selfiecropped: this.data.selfiecropped,
                nodeInstance: this
            };  
        }
    }

    setPosition(x, y, z) {
        this.position.set(x, y, z);
        if (this.mesh) {
            this.mesh.position.copy(this.position);
        }
    }

    setSpriteScale(scale) {
        this.spriteScale = scale;
        if (this.sprite) {
            this.sprite.scale.set(this.originalScale * scale, this.originalScale * scale, 1);
        }
    }
}

export { Node };