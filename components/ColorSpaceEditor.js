// Creates a color space from 6 axis ends & allows editing of all lattice point colors.
// Supports different lattice resolutions for further refinement.

/* 
    THREE JS COLOR MANAGEMENT

    When passing a color to THREE the easiest way is to use the hex value.
    If we want to pass something like [100, 100, 100] we need to instantiate new THREE.Color('rgb(100, 100, 100)')
    instead of new THREE.Color(100, 100, 100) because THREE expects a value from 0 to 1.

    Also, if we use the expression THREE.Color('rgb(100, 100, 100)') or THREE.Color('#646464') 
    the color is automatically converted to linear space behind the scenes, without us needing to 
    invoke .convertSRGBToLinear().

    So, use either hex or 'rgb(...)' to create a THREE color without having to deal with conversions.
*/

// TO DO:
// - tricubic interpolation

import * as THREE from 'three'
import { useState, useRef, useEffect, startTransition, useId } from 'react'
import { useControls, folder, button } from 'leva'
import {
    Sphere,
    Line,
    Billboard,
    Cylinder,
    GizmoHelper,
    GizmoViewport,
    GizmoViewcube
} from '@react-three/drei'
import download from 'downloadjs' // used to save the color config json
import { clamp, pcsToXyz, xyzToPcs, isEqual } from '../utils/utils'
import { useThree } from '@react-three/fiber'
import Color from 'color'
import { getColor as getPCSColor } from '../utils/utils'
import { Vector3 } from 'three'
import colorConfigs from '../configs/colorSpace'

// kept as global variables because useControls doesn't always have access to the latest state probably because of closures
// should be done with useRef()
let colorSpaceConfig = { editPoints: [], latticePoints: [] }
let currentSelection = undefined
let resolution = 1

function ColorSpaceEditor() {
    const spaceMin = -100
    const spaceMax = 100
    const spaceLength = Math.abs(spaceMax - spaceMin)
    const maxResolution = 5

    const { invalidate } = useThree()
    const [selected, setSelected] = useState()
    let [editPoints, setEditPoints] = useState([])

    let [latticePoints, setLatticePoints] = useState(generateLattice())
    const [regionPoints, setRegionPoints] = useState([])
    const [interpolatedColor, setInterpolatedColor] = useState([0, 0, 0])

    const interpolatedRef = useRef()
    const instancesRef = useRef()

    // min & max on each axis
    const xMin = Math.min(...latticePoints.map(el => el.position[0])) // x coords array
    const xMax = Math.max(...latticePoints.map(el => el.position[0]))
    const yMin = Math.min(...latticePoints.map(el => el.position[1])) // y coords array
    const yMax = Math.max(...latticePoints.map(el => el.position[1]))
    const zMin = Math.min(...latticePoints.map(el => el.position[2])) // z coords array
    const zMax = Math.max(...latticePoints.map(el => el.position[2]))

    let colorConfigItems = []
    for (const prop in colorConfigs) colorConfigItems.push(prop)

    const [controls, setControls] = useControls(
        () => ({
            'edit points': folder({
                resolution: { value: 1, min: 1, max: maxResolution, step: 1 },
                color: 'rgb(75, 75, 75)',
                saturation: { value: 0, min: 0, max: 100 },
                brightness: { value: 0, min: 0, max: 100 },
                'remove edit': button(
                    () => {
                        if (currentSelection) {
                            const existingEditIdx = editPoints.findIndex(el =>
                                isEqual(el.pcs, currentSelection.pcs)
                            )

                            if (existingEditIdx > -1) {
                                editPoints.splice(existingEditIdx, 1)
                                updateEditPointsDependencies()
                                updateFillColors()

                                const currentPosition = [controls.p, controls.c, controls.s]
                                const interpolatedColor = getColor(
                                    ...currentPosition,
                                    latticePoints
                                )

                                setInterpolatedColor(interpolatedColor)
                            }
                        }
                    },
                    {
                        // active if selection is edit point, disabled otherwise
                        disabled: currentSelection
                            ? !editPoints.find(el => isEqual(el.pcs, currentSelection.pcs))
                            : true
                    }
                )
            }),
            interpolation: folder(
                {
                    interpolate: { value: false, label: 'visible' },
                    c: { min: xMin, max: xMax, value: 50, step: 1, label: 'X' },
                    p: { min: yMin, max: yMax, value: 50, step: 1, label: 'Y' },
                    s: { min: -zMax, max: -zMin, value: 50, step: 1, label: 'Z' }
                }
                // { collapsed: true }
            ),
            'fill space': folder(
                {
                    fill: { value: true, label: 'visible' },
                    fillResolution: {
                        value: 2,
                        min: 1,
                        max: maxResolution,
                        step: 1,
                        label: 'resolution'
                    },
                    sliceC: { min: xMin, max: xMax, value: [xMin, xMax], label: 'slice X' },
                    sliceP: { min: yMin, max: yMax, value: [yMin, yMax], label: 'slice Y' },
                    sliceS: { min: -zMax, max: -zMin, value: [-zMax, -zMin], label: 'slice Z' }
                }
                // { collapsed: true }
            ),
            'load / save color space': folder(
                {
                    config: { options: colorConfigItems, label: 'examples' },
                    'log edit points': button(() => {
                        const filteredEdits = colorSpaceConfig.editPoints.map(el => ({
                            pcs: el.pcs,
                            color: el.color
                        })) // filter the position property
                        const jsonString = JSON.stringify({ editPoints: filteredEdits })

                        console.log(jsonString)
                    }),
                    'log color space': button(() => {
                        const filteredLattices = colorSpaceConfig.latticePoints.map(el => ({
                            pcs: el.pcs,
                            color: el.color
                        })) // filter the position property
                        const jsonString = JSON.stringify({ colorSpace: filteredLattices })

                        console.log(jsonString)
                    }),
                    'save color space JSON': button(() => {
                        const filteredEdits = colorSpaceConfig.editPoints.map(el => ({
                            pcs: el.pcs,
                            color: el.color
                        })) // filter the position property
                        const filteredLattices = colorSpaceConfig.latticePoints.map(el => ({
                            pcs: el.pcs,
                            color: el.color
                        })) // filter the position property
                        const jsonString = JSON.stringify({
                            colorSpace: filteredLattices,
                            editPoints: filteredEdits
                        })

                        download(jsonString, 'color-space.json', 'application/json') // save the config .json
                    })
                },
                {
                    collapsed: false
                }
            )
        }),
        [currentSelection, editPoints]
    )

    const fillStep = 20 / 2 ** (controls.fillResolution - 1)

    function generateLattice(res = resolution) {
        let lattice = []

        // getting the edit colors of axes endpoints or black in case they are not edited yet
        const pMaxPoint = editPoints.find(el => isEqual(el.pcs, [100, 0, 0]))
        const pMaxColor = pMaxPoint ? pMaxPoint.color : [0, 0, 0]
        const pMinPoint = editPoints.find(el => isEqual(el.pcs, [-100, 0, 0]))
        const pMinColor = pMinPoint ? pMinPoint.color : [0, 0, 0]
        const cMaxPoint = editPoints.find(el => isEqual(el.pcs, [0, 100, 0]))
        const cMaxColor = cMaxPoint ? cMaxPoint.color : [0, 0, 0]
        const cMinPoint = editPoints.find(el => isEqual(el.pcs, [0, -100, 0]))
        const cMinColor = cMinPoint ? cMinPoint.color : [0, 0, 0]
        const sMaxPoint = editPoints.find(el => isEqual(el.pcs, [0, 0, 100]))
        const sMaxColor = sMaxPoint ? sMaxPoint.color : [0, 0, 0]
        const sMinPoint = editPoints.find(el => isEqual(el.pcs, [0, 0, -100]))
        const sMinColor = sMinPoint ? sMinPoint.color : [0, 0, 0]

        for (let i = 1; i <= res; i += 1) {
            let denserLattice = []
            const step = Math.abs(spaceMax - spaceMin) / 2 ** i

            for (let p = spaceMin; p <= spaceMax; p += step) {
                for (let c = spaceMin; c <= spaceMax; c += step) {
                    for (let s = spaceMin; s <= spaceMax; s += step) {
                        const pcs = [p, c, s],
                            xyz = pcsToXyz(pcs)
                        let color = [0, 0, 0]

                        // color of lattice points is computed by interpolating the lower lattice
                        if (p % 100 !== 0 || c % 100 !== 0 || s % 100 !== 0)
                            color = getColor(...pcs, lattice)

                        // addition used for edge & corner colors, sum of axes endpoint colors
                        // the rest of the points get interpolated
                        if (p === 100 && c % 100 === 0 && s % 100 === 0) {
                            // points at P100 on the basic lattice
                            color[0] += pMaxColor[0]
                            color[1] += pMaxColor[1]
                            color[2] += pMaxColor[2]
                        } else if (p === -100 && c % 100 === 0 && s % 100 === 0) {
                            color[0] += pMinColor[0]
                            color[1] += pMinColor[1]
                            color[2] += pMinColor[2]
                        }

                        if (c === 100 && p % 100 === 0 && s % 100 === 0) {
                            color[0] += cMaxColor[0]
                            color[1] += cMaxColor[1]
                            color[2] += cMaxColor[2]
                        } else if (c === -100 && p % 100 === 0 && s % 100 === 0) {
                            color[0] += cMinColor[0]
                            color[1] += cMinColor[1]
                            color[2] += cMinColor[2]
                        }

                        if (s === 100 && p % 100 === 0 && c % 100 === 0) {
                            color[0] += sMaxColor[0]
                            color[1] += sMaxColor[1]
                            color[2] += sMaxColor[2]
                        } else if (s === -100 && p % 100 === 0 && c % 100 === 0) {
                            color[0] += sMinColor[0]
                            color[1] += sMinColor[1]
                            color[2] += sMinColor[2]
                        }

                        // balance point color computed as the sum of the 6 endpoints / 3
                        if (p === 0 && c === 0 && s === 0) {
                            color[0] = (sMinColor[0] + sMaxColor[0]) / 2
                            color[1] = (cMinColor[1] + cMaxColor[1]) / 2
                            color[2] = (pMinColor[2] + pMaxColor[2]) / 2
                        }

                        // RGB accepts only integers and needs to be clamped since the sum of colors can exceed 255 in corners & edges
                        color = color.map(el => clamp(Math.round(el), 0, 255))
                        denserLattice.push({ pcs: pcs, color: color, position: xyz })
                    }
                }
            }

            denserLattice = mergeEditPoints(denserLattice)
            lattice = denserLattice
        }

        return lattice
    }

    function mergeEditPoints(lattice, res = resolution) {
        const step = 200 / 2 ** res

        for (let idx in editPoints) {
            const editPt = editPoints[idx]
            const isVisible =
                editPt.pcs[0] % step === 0 &&
                editPt.pcs[1] % step === 0 &&
                editPt.pcs[2] % step === 0
            if (!isVisible) continue

            const latticeIdx = lattice.findIndex(lattPt => isEqual(editPt.pcs, lattPt.pcs))
            if (latticeIdx >= 0) lattice[latticeIdx].color = editPt.color
        }

        return lattice
    }

    function getBoundaries(currPos, axisPositions) {
        const min = Math.min(...axisPositions)
        const max = Math.max(...axisPositions)
        let lower = min
        let higher = max

        for (let i = 0; i < axisPositions.length; i += 1) {
            if (axisPositions[i] <= currPos && axisPositions[i] > lower) lower = axisPositions[i]
            else if (axisPositions[i] > currPos && axisPositions[i] < higher)
                higher = axisPositions[i]
        }

        // set lower to second to last value, so it doesn't match higher
        if (currPos === max) lower = axisPositions[axisPositions.length - 2]

        return [lower, higher]
    }

    function getRegion(p, c, s, lattice = latticePoints) {
        const [x, y, z] = pcsToXyz(p, c, s)
        const region = []

        let xCoords = lattice.map(el => el.position[0]) // x coords array
        let yCoords = lattice.map(el => el.position[1]) // y coords array
        let zCoords = lattice.map(el => el.position[2]) // z coords array
        // removing duplicates
        xCoords = [...new Set(xCoords)]
        yCoords = [...new Set(yCoords)]
        zCoords = [...new Set(zCoords)]

        const [xLower, xHigher] = getBoundaries(x, xCoords)
        const [yLower, yHigher] = getBoundaries(y, yCoords)
        const [zLower, zHigher] = getBoundaries(z, zCoords)

        function getEditOrLatticePoint(x, y, z) {
            // get object color from editPoints points
            // did not use isEqual() in the next statements because it slows down performance when dealing with large numbers of instances
            let point = editPoints.find(
                el => el.position[0] === x && el.position[1] === y && el.position[2] === z
            )
            // or from the lattice otherwise
            if (!point)
                point = lattice.find(
                    el => el.position[0] === x && el.position[1] === y && el.position[2] === z
                )

            return point
        }

        // getting the region points
        region.push(
            getEditOrLatticePoint(xHigher, yHigher, zHigher), // + + +
            getEditOrLatticePoint(xHigher, yHigher, zLower), // + + -
            getEditOrLatticePoint(xHigher, yLower, zHigher), // + - +
            getEditOrLatticePoint(xHigher, yLower, zLower), // + - -
            getEditOrLatticePoint(xLower, yHigher, zHigher), // - + +
            getEditOrLatticePoint(xLower, yHigher, zLower), // - + -
            getEditOrLatticePoint(xLower, yLower, zHigher), // - - +
            getEditOrLatticePoint(xLower, yLower, zLower) // - - -
        )

        // segment lengths, computed in getRegion since we know all values, so we don't recompute them again in getColor
        // because it slows down performance when dealing with large numbers of instances
        region.axisLength = [xHigher - xLower, yHigher - yLower, zHigher - zLower]

        return region
    }

    function getColor(p, c, s, lattice) {
        const [x, y, z] = pcsToXyz(p, c, s)
        const color = [0, 0, 0]
        const region = getRegion(p, c, s, lattice)
        // length of each region side, computed on the spot if missing, usually 100
        const lengthX = region.axisLength
            ? region.axisLength[0]
            : Math.max(...region.map(el => el[0])) - Math.min(...region.map(el => el[0]))
        const lengthY = region.axisLength
            ? region.axisLength[1]
            : Math.max(...region.map(el => el[1])) - Math.min(...region.map(el => el[1]))
        const lengthZ = region.axisLength
            ? region.axisLength[2]
            : Math.max(...region.map(el => el[2])) - Math.min(...region.map(el => el[2]))

        for (let i = 0; i < region.length; i += 1) {
            const point = region[i]

            const dx = Math.abs(x - point.position[0])
            const dy = Math.abs(y - point.position[1])
            const dz = Math.abs(z - point.position[2])

            // weight/influence of a lattice point on a given point P is equal to the volume opposing the lattice point over the whole volume
            const weight =
                ((lengthX - dx) * (lengthY - dy) * (lengthZ - dz)) / (lengthX * lengthY * lengthZ)

            color[0] += weight * point.color[0] // r
            color[1] += weight * point.color[1] // g
            color[2] += weight * point.color[2] // b
        }

        // some lattice values created by addition can exceed 255 and need to be clamped
        // for example if I choose color[255, 255, 255] for all 3 axes the sum will be[765, 765, 765]
        // RGB accepts only integers
        return color.map(item => clamp(Math.round(item), 0, 255))
    }

    function getLatticePointRadius(pcs) {
        const [p, c, s] = pcs
        let radius = 2

        // selects axis extremes
        if (
            (Math.abs(p) === spaceMax && c === 0 && s === 0) ||
            (p === 0 && Math.abs(c) === spaceMax && s === 0) ||
            (p === 0 && c === 0 && Math.abs(s) === spaceMax)
        ) {
            radius = 4
        }

        const editedPoint = editPoints.findIndex(el => isEqual(el.pcs, pcs))

        if (editedPoint >= 0) radius = 3

        if (controls.fill) {
            radius = fillStep * 0.8
        }

        // points outside the sliced space
        if (
            p < controls.sliceP[0] ||
            p > controls.sliceP[1] ||
            c < controls.sliceC[0] ||
            c > controls.sliceC[1] ||
            s < controls.sliceS[0] ||
            s > controls.sliceS[1]
        ) {
            radius = 0
        }

        return radius
    }

    function handleClick(evt) {
        evt.stopPropagation()

        let col = 0,
            pos
        const name = evt.object.name

        if (name === 'instancesMesh') {
            // instance clicked
            pos = new THREE.Matrix4()
            col = new THREE.Color()

            instancesRef.current.getMatrixAt(evt.instanceId, pos)
            instancesRef.current.getColorAt(evt.instanceId, col)
            col.convertLinearToSRGB() // Three stores all color in linear values, needs conversion to match colors on screen

            pos = new THREE.Vector3().setFromMatrixPosition(pos).toArray()
            col = col
                .getStyle()
                .match(/(\d+)?\.?\d+/g)
                .map(Number) // converts 'rgb(1,2,3)' to [1,2,3]
        } else if (name === 'latticePointsMesh') {
            // lattice
            pos = [...evt.object.position]
            col = latticePoints.find(el => isEqual(el.position, pos)).color

            // currentSelection is used for Reset Edit button, Leva cannot access the latest state of selected
            currentSelection = { pcs: xyzToPcs(pos), color: col, position: pos }

            const saturation = Color.rgb(col).hsv().saturationv()
            const brightness = Color.rgb(col).hsv().value()

            setControls({
                ...controls,
                color: `rgb(${col})`,
                saturation: saturation,
                brightness: brightness
            })
            setSelected({ pcs: xyzToPcs(pos), color: col, position: pos })
        } else if (name === 'interpolatedMesh') {
            // interpolated sphere clicked
            pos = [...evt.object.position]
            col = new THREE.Color(evt.object.material.color)
            col = col
                .getStyle()
                .match(/(\d+)?\.?\d+/g)
                .map(Number) // converts 'rgb(1,2,3)' to [1,2,3]
        }

        console.log('pcs:', xyzToPcs(pos))
        console.log('color in this space:', col)
    }

    function deselect(evt) {
        if (evt === undefined || evt.type === 'click' || evt.type === 'keyup') {
            currentSelection = undefined
            setControls({ ...controls, color: 'rgb(75, 75, 75)', resolution: resolution })
            setSelected()
        }
    }

    function updateFillColors() {
        let instanceId = 0

        for (let p = spaceMin; p <= spaceMax; p += fillStep) {
            for (let c = spaceMin; c <= spaceMax; c += fillStep) {
                for (let s = spaceMin; s <= spaceMax; s += fillStep) {
                    const color = getColor(p, c, s, latticePoints)
                    const linearColor = new THREE.Color(`rgb(${color})`)

                    instancesRef.current.setColorAt(instanceId, linearColor)

                    instanceId += 1
                }
            }
        }

        // update matrices after color changes
        instancesRef.current.instanceColor.needsUpdate = true

        // used to trigger frames manually, see explanation at variable declaration
        invalidate()
    }

    function updateEditPointsDependencies() {
        // merge latticePoints with the new edit points
        latticePoints = mergeEditPoints(latticePoints)
        // regenerate the lattice
        latticePoints = generateLattice()

        //updating the color space config
        colorSpaceConfig.editPoints = editPoints
        colorSpaceConfig.latticePoints = latticePoints

        if (controls.fill) {
            startTransition(() => {
                updateFillColors()
            })
        }

        setEditPoints(editPoints)
        setLatticePoints(latticePoints)
    }

    // resolution change effect
    useEffect(() => {
        resolution = controls.resolution

        // deselect when going to a lower res & the selected point is not visible
        if (selected) {
            const step = Math.abs(spaceMax - spaceMin) / 2 ** resolution
            const isVisible =
                selected.pcs[0] % step === 0 &&
                selected.pcs[1] % step === 0 &&
                selected.pcs[2] % step === 0 // does not fall in between lattice points at a given resolution
            if (!isVisible) deselect()
        }

        updateEditPointsDependencies()

        const currentPosition = pcsToXyz(controls.p, controls.c, controls.s)
        const region = getRegion(...currentPosition)

        setRegionPoints(region)
    }, [controls.resolution])

    // selected & color changes effect
    useEffect(() => {
        if (selected) {
            // get color from picker
            const pickerColor = controls.color.match(/(\d+)?\.?\d+/g).map(Number) //  converts 'rgb(1,2,3)' to [1,2,3]

            // color changed in panel
            if (!isEqual(selected.color, pickerColor)) {
                const existingEditIdx = editPoints.findIndex(el => isEqual(el.pcs, selected.pcs))

                // update selected color
                selected.color = pickerColor
                currentSelection.color = pickerColor
                // update existing edit or add new one
                if (existingEditIdx >= 0)
                    editPoints[existingEditIdx] = { ...selected, color: pickerColor }
                else editPoints.push({ ...selected, color: pickerColor })

                updateEditPointsDependencies()
            }
        }
    }, [selected, controls.color])

    // saturation & brightness changes effect
    useEffect(() => {
        if (selected) {
            // add new saturation & brightness values to selected color
            const hsvColor = Color.rgb(selected.color).hsv().object()
            hsvColor.s = controls.saturation
            hsvColor.v = controls.brightness
            const rgbColor = Color.hsv(hsvColor).rgb().round().array()

            // update selected color
            selected.color = rgbColor
            currentSelection.color = rgbColor
            // update existing edit or add new one
            const existingEditIdx = editPoints.findIndex(el => isEqual(el.pcs, selected.pcs))
            if (existingEditIdx >= 0) editPoints[existingEditIdx] = { ...selected, color: rgbColor }
            else editPoints.push({ ...selected, color: rgbColor })

            updateEditPointsDependencies()
        }
    }, [controls.saturation, controls.brightness])

    //config changes effect
    useEffect(() => {
        editPoints = colorConfigs[controls.config].map(el => ({
            ...el,
            position: pcsToXyz(el.pcs)
        }))

        updateEditPointsDependencies()
        deselect()
    }, [controls.config, colorConfigs])

    // default controls change effect
    useEffect(() => {
        const currentPosition = [controls.p, controls.c, controls.s]

        // compute only the position of instances for a better performance, color computed in the 'resolution or fill changed effect'
        if (controls.fill) {
            let instanceId = 0

            for (let p = spaceMin; p <= spaceMax; p += fillStep) {
                for (let c = spaceMin; c <= spaceMax; c += fillStep) {
                    for (let s = spaceMin; s <= spaceMax; s += fillStep) {
                        const xyz = pcsToXyz(p, c, s)
                        const matrix = new THREE.Matrix4().setPosition(...xyz)

                        if (
                            p < controls.sliceP[0] ||
                            p > controls.sliceP[1] ||
                            c < controls.sliceC[0] ||
                            c > controls.sliceC[1] ||
                            s < controls.sliceS[0] ||
                            s > controls.sliceS[1]
                        ) {
                            matrix.makeScale(0, 0, 0)
                        }

                        instancesRef.current.setMatrixAt(instanceId, matrix)

                        instanceId += 1
                    }
                }
            }
            // update matrices after position & color changes
            instancesRef.current.instanceMatrix.needsUpdate = true

            // show instances, hide interpolation sphere
            instancesRef.current.visible = true
            interpolatedRef.current.visible = false
        } else if (controls.interpolate && !controls.fill) {
            const regionData = getRegion(...currentPosition)
            const color = getColor(...currentPosition, latticePoints)

            interpolatedRef.current.visible = true
            instancesRef.current.visible = false

            setInterpolatedColor(color)
            setRegionPoints(regionData)
        } else {
            instancesRef.current.visible = false
            interpolatedRef.current.visible = false
        }

        // used to trigger frames manually, see explanation at variable declaration
        invalidate()
    }, [controls, instancesRef, interpolatedRef])

    // compute fill color on color change effect
    useEffect(() => {
        if (controls.fill) updateFillColors()
    }, [
        controls.color,
        controls.fill,
        controls.fillResolution,
        instancesRef,
        controls['remove edit']
    ])

    // deselect on ESC
    document.addEventListener('keyup', evt => {
        if (evt.key === 'Escape') deselect(evt)
    })

    return (
        <>
            <group
                onPointerMissed={deselect} // deselect on clicking outside
                onClick={handleClick}
            >
                <group ref={interpolatedRef}>
                    <Sphere
                        name='interpolatedMesh'
                        args={[6, 25, 25]}
                        scale={controls.fill ? 0 : controls.interpolate ? 1 : 0}
                        position={pcsToXyz(controls.p, controls.c, controls.s)}
                    >
                        <meshBasicMaterial attach='material' color={`rgb(${interpolatedColor})`} />
                    </Sphere>

                    {regionPoints.map((el, idx) => {
                        return (
                            <Line
                                points={[pcsToXyz(controls.p, controls.c, controls.s), el.position]}
                                color='#b4b4b4'
                                lineWidth={0.5} // In pixels (default)
                                dashed={false} // Default
                                key={`${idx}`}
                            />
                        )
                    })}
                </group>

                {/* fill space mesh */}
                <instancedMesh
                    args={[null, null, (spaceLength / fillStep + 1) ** 3]}
                    ref={instancesRef}
                    name='instancesMesh'
                    onClick={handleClick}
                    scale={controls.fill ? 1 : 0}
                >
                    <boxGeometry args={[fillStep, fillStep, fillStep]} />
                    {/* <sphereGeometry args={[4, 10, 10]} /> */}
                    <meshBasicMaterial />
                </instancedMesh>

                {/* selected highlight circle */}
                {selected && (
                    <Billboard
                        follow={true}
                        lockX={false}
                        lockY={false}
                        lockZ={false}
                        position={selected ? selected.position : [0, 0, 0]}
                        visible={selected ? true : false}
                    >
                        <Cylinder
                            args={
                                selected
                                    ? [
                                          getLatticePointRadius(selected.pcs) + 2,
                                          getLatticePointRadius(selected.pcs) + 2,
                                          0.1,
                                          20,
                                          1
                                      ]
                                    : [0, 0, 0.1, 20, 1]
                            }
                            rotation={[-Math.PI / 2, 0, 0]}
                        >
                            <meshBasicMaterial attach='material' color={'white'} />
                        </Cylinder>
                    </Billboard>
                )}
                {latticePoints.map((el, idx) => (
                    <Sphere
                        args={[getLatticePointRadius(el.pcs), 25, 25]}
                        name='latticePointsMesh'
                        position={el.position}
                        key={'lattice' + idx}
                    >
                        <meshBasicMaterial attach='material' color={`rgb(${el.color})`} />
                    </Sphere>
                ))}
            </group>
            {/* <GizmoHelper
                alignment='bottom-right' // widget alignment within scene
                margin={[80, 80]} // widget margins (X, Y)
            >
                <GizmoViewport
                    axisColors={['#49b500', '#205cff', '#ff1919']}
                    labels={['C', 'P', '-S']}
                    labelColor='white'
                    hideNegativeAxes={true}
                />
            </GizmoHelper> */}
        </>
    )
}

export default ColorSpaceEditor
