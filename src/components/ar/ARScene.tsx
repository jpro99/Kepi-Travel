import 'aframe';
import '@ar-js-org/ar.js';
import './PathShader'; // Register the A-Frame component
import { FC, useEffect } from 'react';

declare global {
    namespace JSX {
        interface IntrinsicElements {
            'a-scene': any;
            'a-marker': any;
            'a-entity': any;
            'a-camera': any;
            'a-tube': any; // Added for path
        }
    }
}

interface ARSceneProps {
    children: React.ReactNode;
}

const ARScene: FC<ARSceneProps> = ({ children }) => {

    useEffect(() => {
        const scene = document.querySelector('a-scene');
        if (scene) {
            scene.addEventListener('loaded', () => {
                console.log('AR scene loaded');
            });
        }
    }, []);

    return (
        <a-scene
            vr-mode-ui='enabled: false'
            renderer='logarithmicDepthBuffer: true;'
            arjs='sourceType: webcam; videoTexture: true; debugUIEnabled: false;'
        >
            <a-camera gps-camera rotation-reader />
            {children}
        </a-scene>
    );
};

export default ARScene;
