import Head from 'next/head'
import Image from 'next/image'
import ColorSpaceEditor from '../components/ColorSpaceEditor'
import Scene from '../components/Scene'

export default function Home() {
    return (
        <Scene>
            <ColorSpaceEditor />
        </Scene>
    )
}
