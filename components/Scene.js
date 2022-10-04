import { Color } from 'three'
import { useContext, useEffect, useState } from 'react'
import { Canvas, useFrame, useThree, events, addAfterEffect, addTail } from '@react-three/fiber'
import { OrbitControls, ContactShadows } from '@react-three/drei'
import LightSetup from './LightSetup'

function Scene(props) {
    const initialCameraPosition = [475, 345, -450]
    const hexBackgroundColor = '#e5e5e5' // #e5e5e5, #f7f7f8
    const sceneBackgroundColor = new Color(hexBackgroundColor)

    return (
        <Canvas
            camera={{
                position: initialCameraPosition,
                fov: 44.76, // 42.5mm, halfway between 35mm and 50mm focal length
                far: 10000,
                target: [0, 0, 0]
            }}
            flat
            frameloop='demand' /* frameloop=' demand' only renders frames when something is moving, not 60 times a second. */
            shadows
        >
            <color attach='background' args={[sceneBackgroundColor]} />

            {/* need to pass the context into Canvas, not done by default. see: https://github.com/pmndrs/react-three-fiber/issues/262#issuecomment-568274573 */}
            <LightSetup />
            <OrbitControls
                makeDefault
                dampingFactor={0.085} // default is 0.05
                target={[0, 0, 0]}
                minDistance={0.8}
                maxDistance={1000}
            />

            {props.children}
        </Canvas>
    )
}

export default Scene
