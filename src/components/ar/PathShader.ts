AFRAME.registerComponent('path-shader', {
    schema: {
        color: { type: 'color', default: '#007AFF' },
        time: { type: 'number' }
    },
    init: function () {
        const data = this.data;
        this.material = new AFRAME.THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0.0 },
                color: { value: new AFRAME.THREE.Color(data.color) }
            },
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform float time;
                uniform vec3 color;
                varying vec2 vUv;

                void main() {
                    float alpha = 0.8;
                    float speed = 1.5;
                    float wave = sin(vUv.x * 10.0 + time * speed) * 0.1 + 0.9;
                    alpha *= wave;
                    alpha *= (1.0 - vUv.y); // Fade out at the edges

                    gl_FragColor = vec4(color, alpha);
                }
            `,
            transparent: true
        });
        this.el.addEventListener('object3dset', () => {
            this.el.object3D.traverse(node => {
                if (node.isMesh) {
                    node.material = this.material;
                }
            });
        });
    },
    tick: function (time) {
        this.material.uniforms.time.value = time / 1000;
    }
});
