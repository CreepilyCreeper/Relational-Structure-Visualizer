import * as THREE from 'three';

// Shared fallback texture (singleton) - loaded once and reused
let sharedFallbackTexture = null;
let fallbackTextureLoading = false;
const fallbackTextureCallbacks = [];

function getSharedFallbackTexture(callback) {
    if (sharedFallbackTexture) {
        callback(sharedFallbackTexture);
        return;
    }
    fallbackTextureCallbacks.push(callback);
    if (!fallbackTextureLoading) {
        fallbackTextureLoading = true;
        new THREE.TextureLoader().load(
            './assets/selfiescropped/fallback_CROPPED.jpg',
            (texture) => {
                sharedFallbackTexture = texture;
                fallbackTextureCallbacks.forEach(cb => cb(texture));
                fallbackTextureCallbacks.length = 0;
            },
            undefined,
            () => {
                // On error, create a simple colored texture as fallback
                const canvas = document.createElement('canvas');
                canvas.width = 64;
                canvas.height = 64;
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = '#888888';
                ctx.fillRect(0, 0, 64, 64);
                sharedFallbackTexture = new THREE.CanvasTexture(canvas);
                fallbackTextureCallbacks.forEach(cb => cb(sharedFallbackTexture));
                fallbackTextureCallbacks.length = 0;
            }
        );
    }
}

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
        this.sprite = null;
        this.spriteScale = 5;
    }

    // Synchronous node creation - textures load in background
    createNode(allYears = null) {
        const geometry = new THREE.SphereGeometry(this.originalScale, 32, 32);
        const color = new THREE.Color(this.config.nodeColor);
        const material = new THREE.MeshBasicMaterial({
            color: color,
            transparent: false
        });
        this.mesh = new THREE.Mesh(geometry, material);

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

        // Add user data for interactions (no referrals, use parent/linktype)
        this.mesh.userData = {
            uniqueKey: this.data.uniqueKey,
            name: this.data.name,
            joinDate: this.data.joinDate,
            parent: this.data.parent || "",
            linktype: this.data.linktype || "",
            selfie: this.data.selfie,
            selfiecropped: this.data.selfiecropped,
            testimonial: this.data.testimonial,
            nodeInstance: this
        };

        // --- Add Sprite for Cropped Image with shared fallback ---
        if (this.data.selfiecropped && this.data.uniqueKey) {
            // Create sprite with a temporary transparent material (texture loads async)
            const spriteMaterial = new THREE.SpriteMaterial({ transparent: true, opacity: 0, depthTest: false });
            this.sprite = new THREE.Sprite(spriteMaterial);
            this.sprite.renderOrder = 999;
            const initialScale = (this.useCroppedImage ? this.spriteScale : 0);
            this.sprite.scale.set(this.originalScale * initialScale, this.originalScale * initialScale, 1);
            this.sprite.center.set(0.5, 0.5);
            this.sprite.visible = this.useCroppedImage;
            // Put sprites on a non-bloom layer so postprocessing bloom doesn't affect them
            // Layer index 1 is reserved for non-bloom (sprites)
            this.sprite.layers.set(1);
            this.mesh.add(this.sprite);

            // Add user data to sprite for interactions
            this.sprite.userData = {
                name: this.data.name,
                joinDate: this.data.joinDate,
                parent: this.data.parent || "",
                linktype: this.data.linktype || "",
                selfie: this.data.selfie,
                selfiecropped: this.data.selfiecropped,
                testimonial: this.data.testimonial,
                nodeInstance: this
            };

            // Load shared fallback texture, then try to load the real image
            getSharedFallbackTexture((fallbackTexture) => {
                if (!this.sprite) return;
                this.sprite.material.map = fallbackTexture;
                this.sprite.material.opacity = 1;
                this.sprite.material.needsUpdate = true;

                // Load the real image in the background
                this.loadTexturePromise(this.data.selfiecropped)
                    .then(texture => {
                        if (!this.sprite) return;
                        this.sprite.material.map = texture;
                        this.sprite.material.needsUpdate = true;
                    })
                    .catch(() => {
                        // Keep using fallback
                    });
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
                uniqueKey: this.data.uniqueKey,
                name: this.data.name,
                joinDate: this.data.joinDate,
                parent: this.data.parent || "",
                linktype: this.data.linktype || "",
                selfie: this.data.selfie,
                selfiecropped: this.data.selfiecropped,
                testimonial: this.data.testimonial,
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