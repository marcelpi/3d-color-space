import { Sky, Environment, Lightformer } from '@react-three/drei'

function LightSetup() {
    return (
        <>
            <ambientLight intensity={0.85} />
            <directionalLight intensity={0.25} />
            <directionalLight intensity={0.1} position={[0, -1, 0]} />
            {/* <Environment files='/assets/images/bg.hdr' background></Environment> */}
            <Environment background={false}>
                <Lightformer
                    form='circle'
                    color='white'
                    intensity={0.5}
                    scale={50}
                    position={[0, 50, 0]}
                    target={[0, 0, 0]}
                />
            </Environment>
        </>
    )
}

export default LightSetup
