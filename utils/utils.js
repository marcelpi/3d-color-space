import colorSpace from '../configs/colorSpace'

// Clamp value between min and max
function clamp(value, min = 0, max = 1) {
    return Math.min(Math.max(value, min), max)
}

// Distance between two points
function distance(source, target) {
    // sqrt( (x2-x1)^2 + (y2-y1)^2 + (z2-z1)^2 ) - parallelepiped diagonal
    return Math.sqrt(
        (target.x - source.x) ** 2 + (target.y - source.y) ** 2 + (target.z - source.z) ** 2
    )
}

function isEqual(a, b) {
    // no arguments
    if (arguments.length === 0) return false

    // objects & arrays
    if (typeof a === 'object' && typeof b === 'object' && a && b) {
        //  && a && b filters null values, since typeof null === 'object'
        if (a.length !== b.length) return false

        for (let prop in a) {
            if (typeof a[prop] === 'object' && typeof b[prop] === 'object') {
                if (!isEqual(a[prop], b[prop])) return false
            } else if (a[prop] !== b[prop]) return false
        }
    }
    // numbers, strings, booleans, undefined, nulls
    else if (a !== b) return false

    return true
}

function isNumber(val) {
    // because typeof (NaN) is 'number' and passes the filter
    // using only !isNaN() causes !isNaN(null) to pass the test
    // both typeof & !isNaN are needed to double check for numbers
    return typeof val === 'number' && !isNaN(val)
}

function radToDeg(radians) {
    return radians * (180 / Math.PI)
}

function degToRad(degree) {
    return degree * (Math.PI / 180)
}

function pcsToXyz(p, c, s) {
    // populate xyz coordinates by this convention: XYZ = CP-S
    if (p.constructor === Array && p.length >= 3)
        if (isNumber(p[0]) && isNumber(p[1]) && isNumber(p[2])) {
            const x = p[1]
            const y = p[0]
            const z = p[2] === 0 ? 0 : -p[2] // avoiding -0

            return [x, y, z]
        }

    if (p.constructor === Object && Object.keys(p).length >= 3)
        if (isNumber(p.p) && isNumber(p.c) && isNumber(p.s)) {
            const x = p.c
            const y = p.p
            const z = p.s === 0 ? 0 : -p.s

            return { x, y, z }
        } else if (isNumber(p.x) && isNumber(p.y) && isNumber(p.z))
            return { x: p.x, y: p.y, z: p.z } // foolproof: if xyz is input by mistake, it returns the same xyz

    if (isNumber(p) && isNumber(c) && isNumber(s)) {
        const x = c
        const y = p
        const z = s === 0 ? 0 : -s

        return [x, y, z]
    }
}

function xyzToPcs(x, y, z) {
    // populate xyz coordinates by this convention: PCS = YX-Z

    if (x.constructor === Array && x.length >= 3)
        if (isNumber(x[0]) && isNumber(x[1]) && isNumber(x[2])) {
            const p = x[1]
            const c = x[0]
            const s = x[2] === 0 ? 0 : -x[2]

            return [p, c, s]
        }

    if (x.constructor === Object && Object.keys(x).length >= 3)
        if (isNumber(x.x) && isNumber(x.y) && isNumber(x.z)) {
            const p = x.y
            const c = x.x
            const s = x.z === 0 ? 0 : -x.z

            return { p, c, s }
        } else if (isNumber(x.p) && isNumber(x.c) && isNumber(x.s))
            return { p: x.p, c: x.c, s: x.s } // foolproof: if pcs is input by mistake, it returns the same pcs

    if (isNumber(x) && isNumber(y) && isNumber(z)) {
        const p = y
        const c = x
        const s = z === 0 ? 0 : -z

        return [p, c, s]
    }
}

function getBoundaries(currPos, axisPositions) {
    const min = Math.min(...axisPositions)
    const max = Math.max(...axisPositions)
    let lower = min
    let higher = max

    for (let i = 0; i < axisPositions.length; i += 1) {
        if (axisPositions[i] <= currPos && axisPositions[i] > lower) lower = axisPositions[i]
        else if (axisPositions[i] > currPos && axisPositions[i] < higher) higher = axisPositions[i]
    }

    // set lower to second to last value, so it doesn't match higher
    if (currPos === max) lower = axisPositions[axisPositions.length - 2]

    return [lower, higher]
}

function getLatticePoint(p, c, s) {
    // did not use isEqual() in the next statement because it slows down performance when dealing with large numbers of instances
    return colorSpace.find(el => el.pcs[0] === p && el.pcs[1] === c && el.pcs[2] === s)
}

function getRegion(p, c, s) {
    const region = []
    let pCoords = [],
        cCoords = [],
        sCoords = []

    colorSpace.map(el => {
        const [p, c, s] = el.pcs
        pCoords.push(p)
        cCoords.push(c)
        sCoords.push(s)
    })

    // removing duplicates
    pCoords = [...new Set(pCoords)]
    cCoords = [...new Set(cCoords)]
    sCoords = [...new Set(sCoords)]

    const [pLower, pHigher] = getBoundaries(p, pCoords)
    const [cLower, cHigher] = getBoundaries(c, cCoords)
    const [sLower, sHigher] = getBoundaries(s, sCoords)

    // getting the region points
    region.push(
        getLatticePoint(pHigher, cHigher, sHigher), // + + +
        getLatticePoint(pHigher, cHigher, sLower), // + + -
        getLatticePoint(pHigher, cLower, sHigher), // + - +
        getLatticePoint(pHigher, cLower, sLower), // + - -
        getLatticePoint(pLower, cHigher, sHigher), // - + +
        getLatticePoint(pLower, cHigher, sLower), // - + -
        getLatticePoint(pLower, cLower, sHigher), // - - +
        getLatticePoint(pLower, cLower, sLower) // - - -
    )

    // segment lengths, computed in getRegion since we know all values, so we don't recompute them again in getColor
    // because it slows down performance when dealing with large numbers of instances
    region.axisLength = [pHigher - pLower, cHigher - cLower, sHigher - sLower]

    return region
}

function getColor(P, C, S) {
    let color = [0, 0, 0]
    const region = getRegion(P, C, S)
    // length of each region side, computed on the spot if missing
    const PLength = region.axisLength
        ? region.axisLength[0]
        : Math.max(...region.map(el => el[0])) - Math.min(...region.map(el => el[0]))
    const CLength = region.axisLength
        ? region.axisLength[1]
        : Math.max(...region.map(el => el[1])) - Math.min(...region.map(el => el[1]))
    const SLength = region.axisLength
        ? region.axisLength[2]
        : Math.max(...region.map(el => el[2])) - Math.min(...region.map(el => el[2]))

    // linear interpolation of region colors
    for (let i = 0; i < region.length; i += 1) {
        const regionPoint = region[i]
        const [PRegionPoint, CRegionPoint, SRegionPoint] = regionPoint.pcs

        // computing the sides of the point's influence volume
        // https://upload.wikimedia.org/wikipedia/commons/thumb/6/62/Trilinear_interpolation_visualisation.svg/640px-Trilinear_interpolation_visualisation.svg.png
        const PDiff = Math.abs(P - PRegionPoint)
        const CDiff = Math.abs(C - CRegionPoint)
        const SDiff = Math.abs(S - SRegionPoint)

        // weight/influence of a lattice point on a given point P is equal to the volume opposing the lattice point over the whole volume
        const weight =
            ((PLength - PDiff) * (CLength - CDiff) * (SLength - SDiff)) /
            (PLength * CLength * SLength)

        color[0] += weight * regionPoint.color[0] // r
        color[1] += weight * regionPoint.color[1] // g
        color[2] += weight * regionPoint.color[2] // b
    }

    // some lattice values created by addition can exceed 255 and need to be clamped
    // for example if I choose color[255, 255, 255] for all 3 axes the sum will be[765, 765, 765]
    // RGB accepts only integers
    color = color.map(el => clamp(Math.round(el), 0, 255))

    return color
}

function easeInOutQuad(x) {
    x = clamp(x)
    return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2
}

export {
    clamp,
    distance,
    pcsToXyz,
    xyzToPcs,
    isNumber,
    isEqual,
    getColor,
    radToDeg,
    degToRad,
    easeInOutQuad
}
