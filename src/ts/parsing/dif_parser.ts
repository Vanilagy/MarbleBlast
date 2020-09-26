import { BinaryFileParser, Box3F, SphereF, Point3F, PlaneF } from "./binary_file_parser";
import { ResourceManager } from "../resources";

const NUM_COORD_BINS = 16;

export interface DifFile {
	version: number,
	previewIncluded: boolean,
	detailLevels: InteriorDetailLevel[],
	subObjects: InteriorDetailLevel[]
}

export interface LightMapTexGen {
	finalWord: number,
	texGenXDistance: number,
	texGenYDistance: number
}

export interface ColorF {
	red: number,
	green: number,
	blue: number,
	alpha: number
}

export interface InteriorDetailLevel {
	interiorFileVersion: number,
	detailLevel: number,
	minPixels: number,
	boundingBox: Box3F,
	boundingSphere: SphereF,
	hasAlarmState: boolean,
	numLightStateEntries: number,
	normals: Point3F[],
	planes: {
		normalIndex: number,
		planeDistance: number
	}[],
	points: Point3F[],
	pointVisibilities: number[],
	texGenEqs: {
		planeX: PlaneF,
		planeY: PlaneF
	}[],
	bspNodes: {
		planeIndex: number,
		frontIndex: number,
		backIndex: number
	}[],
	bspSolidLeaves: {
		surfaceIndex: number,
		surfaceCount: number
	}[],
	materialList: {
		version: number,
		materials: string[]
	},
	windings: number[],
	windingIndices: {
		windingStart: number,
		windingCount: number
	}[],
	edges: unknown[],
	zones: {
		portalStart: number,
		portalCount: number,
		surfaceStart: number,
		surfaceCount: number,
		staticMeshStart: number,
		staticMeshCount: number,
		flags: number,
		zoneId: number
	}[],
	zoneSurfaces: number[],
	zonePortalList: number[],
	portals: {
		planeIndex: number,
        triFanCount: number,
        triFanStart: number,
        zoneFront: number,
        zoneBack: number
	}[],
	surfaces: {
		windingStart: number,
		windingCount: number,
		planeIndex: number,
		textureIndex: number,
		texGenIndex: number,
		surfaceFlags: number,
		fanMask: number,
		lightMapTexGen: LightMapTexGen,
		lightCount: number,
		lightStateInfoStart: number,
		mapOffsetX: number,
		mapOffsetY: number,
		mapSizeX: number,
		mapSizeY: number
	}[],
	normalLMapIndices: number[],
	alarmLMapIndices: number[],
	nullSurfaces: {
		windingStart: number,
		planeIndex: number,
		surfaceFlags: number,
		windingCount: number
	}[],
	lightmaps: ArrayBuffer[],
	lightDirMaps: unknown[],
	lightmapKeep: unknown[],
	solidLeafSurfaces: number[],
	animatedLights: {
		nameIndex: number,
		stateIndex: number,
		stateCount: number,
		flags: number,
		duration: number
	}[],
	lightStates: {
		red: number,
		green: number,
		blue: number,
		activeTime: number,
		dataIndex: number,
		dataCount: number
	}[],
	lightStateData: {
		surfaceIndex: number,
		mapIndex: number,
		lightStateIndex: number
	}[],
	lightStateDataBufferFlags: number,
	lightStateDataBuffer: number[],
	nameBuffer: number[],
	subObjects: {
		soKey: number
	}[],
	convexHulls: {
		hullStart: number,
		hullCount: number,
		minX: number,
		maxX: number,
		minY: number,
		maxY: number,
		minZ: number,
		maxZ: number,
		surfaceStart: number,
		surfaceCount: number,
		planeStart: number,
		polyListPlaneStart: number,
		polyListPointStart: number,
		polyListStringStart: number,
		staticMesh: boolean
	}[],
	convexHullEmitStrings: string[],
	hullIndices: number[],
	hullPlaneIndices: number[],
	hullEmitStringIndices: number[],
	hullSurfaceIndices: number[],
	polyListPlanes: number[],
	polyListPoints: number[],
	polyListStrings: string[],
	coordBins: {
		binStart: number,
		binCount: number
	}[],
	coordBinIndices: number[],
	coordBinMode: number,
	baseAmbientColor: ColorF,
	alarmAmbientColor: ColorF
}

export class DifParser extends BinaryFileParser {
	parse(): DifFile {
		let version = this.readU32();

        let previewIncluded = this.readBool();
        if (previewIncluded) {
            // ...
        }

		let numDetailLevels = this.readU32();
        let detailLevels: InteriorDetailLevel[] = [];
        for (let i = 0; i < numDetailLevels; i++) {
            let interior = this.parseInterior();
            detailLevels.push(interior);
		}
		
		let numSubObjects = this.readU32();
		let subObjects: InteriorDetailLevel[] = [];
		for (let i = 0; i < numSubObjects; i++) {
			let interior = this.parseInterior();
            subObjects.push(interior);
		}

        return {
            version: version,
            previewIncluded: previewIncluded,
			detailLevels: detailLevels,
			subObjects: subObjects
        };
	}

	parseInterior(): InteriorDetailLevel {
        let interiorFileVersion = this.readU32();
        let detailLevel = this.readU32();
        let minPixels = this.readU32();
        let boundingBox = this.readBox3F();
        let boundingSphere = this.readSphereF();
        let hasAlarmState = this.readBool();
        let numLightStateEntries = this.readU32();

        let numNormals = this.readU32();
        let normals = [];
        for (let i = 0; i < numNormals; i++) {
            normals.push(this.readPoint3F());
        }

        let numPlanes = this.readU32();
        let planes = [];
        for (let i = 0; i < numPlanes; i++) {
            let normalIndex = this.readU16(); // Spec says this is U32, but that produces garbage. Assuming U16.
            let planeDistance = this.readF32();

            planes.push({ normalIndex, planeDistance });
        }

        let numPoints = this.readU32();
        let points = [];
        for (let i = 0; i < numPoints; i++) {
            points.push(this.readPoint3F());
        }

        let numPointVisibilities = this.readU32();
        let pointVisibilities = [];
        for (let i = 0; i < numPointVisibilities; i++) {
            // These are either 255 or 0. Spec says it's either 1 or 0, but I didn't observe that.
            pointVisibilities.push(this.readU8());
        }

        let numTexGenEqs = this.readU32();
        let texGenEqs = [];
        for (let i = 0; i < numTexGenEqs; i++) {
            let planeX = this.readPlaneF(),
                planeY = this.readPlaneF();

            texGenEqs.push({ planeX, planeY });
        }

        let numBspNodes = this.readU32();
        let bspNodes = [];
        for (let i = 0; i < numBspNodes; i++) {
            let planeIndex = this.readU16(),
                frontIndex = this.readU16(), // u32 here... sure? mhhh. replaced with u16. but then masking doesn't work...
                backIndex = this.readU16();

            bspNodes.push({ planeIndex, frontIndex, backIndex });
        }

        let numBspSolidLeaves = this.readU32();
        let bspSolidLeaves = [];
        for (let i = 0; i < numBspSolidLeaves; i++) {
            let surfaceIndex = this.readU32(),
                surfaceCount = this.readU16();

            bspSolidLeaves.push({ surfaceIndex, surfaceCount });
        }

        let materialList: any = {};
        materialList.version = this.readU8();
        let numMaterials = this.readU32();
        let materials = [];
        for (let i = 0; i < numMaterials; i++) {
            materials.push(this.readString());
        }
        materialList.materials = materials;

        let numWindings = this.readU32();
        let windings = [];
        for (let i = 0; i < numWindings; i++) {
            let pointIndex = this.readU32();

            windings.push(pointIndex);
        }

        let numWindingIndices = this.readU32();
        let windingIndices = [];
        for (let i = 0; i < numWindingIndices; i++) {
            let windingStart = this.readU32(),
                windingCount = this.readU32();

            windingIndices.push({ windingStart, windingCount });
        }

        let edges: unknown[] = [];
        if (false) { // This interior version skips edges
            let numEdges = this.readU32();
            console.log(numEdges);
            for (let i = 0; i < numEdges; i++) {
                let pointIndex0 = this.readS32(), // Only GOD knows why these are signed. THESE DOCS >.<
                    pointIndex1 = this.readS32(),
                    surfaceIndex0 = this.readS32(),
                    surfaceIndex1 = this.readS32();
    
                edges.push({ pointIndex0, pointIndex1, surfaceIndex0, surfaceIndex1 });
            }
    
            console.log(edges);
        }        

        let numZones = this.readU32();
        let zones = [];
        for (let i = 0; i < numZones; i++) {
            let portalStart = this.readU16(),
                portalCount = this.readU16(),
                surfaceStart = this.readU32(),
                surfaceCount = this.readU16(),
                staticMeshStart = 0,
                staticMeshCount = 0,
                flags = this.readU16(),
                zoneId = 0;

            zones.push({ portalStart, portalCount, surfaceStart, surfaceCount, staticMeshStart, staticMeshCount, flags, zoneId });
        }

        let numZoneSurfaces = this.readU32();
        let zoneSurfaces = []; // List of all surfaces to render
        for (let i = 0; i < numZoneSurfaces; i++) {
            zoneSurfaces.push(this.readU16());
        }

        if (false) {
            // Parse zone static meshes
        }

        let numZonePortalList = this.readU32();
        let zonePortalList = [];
        for (let i = 0; i < numZonePortalList; i++) {
            zonePortalList.push(this.readU16());
        }

        let numPortals = this.readU32();
        let portals = [];
        for (let i = 0; i < numPortals; i++) {
            let planeIndex = this.readU16(),
                triFanCount = this.readU16(),
                triFanStart = this.readU32(),
                zoneFront = this.readU16(),
                zoneBack = this.readU16();

            portals.push({ planeIndex, triFanCount, triFanStart, zoneFront, zoneBack });
        }

        let numSurfaces = this.readU32();
        let surfaces = [];
        for (let i = 0; i < numSurfaces; i++) {
            let windingStart = this.readU32(),
                windingCount = this.readU8(),
                planeIndex = this.readU16(),
                textureIndex = this.readU16(),
                texGenIndex = this.readU32(),
                surfaceFlags = this.readU8(),
                fanMask = this.readU32(),
                lightMapTexGen = this.readLightMapTexGen(),
                lightCount = this.readU16(),
                lightStateInfoStart = this.readU32(),
                mapOffsetX = this.readU8(), // wtf why int?
                mapOffsetY = this.readU8(),
                mapSizeX = this.readU8(),
                mapSizeY = this.readU8();
                //unused = this.parseBool();

            surfaces.push({ windingStart, windingCount, planeIndex, textureIndex, texGenIndex, surfaceFlags, fanMask, lightMapTexGen, lightCount, lightStateInfoStart, mapOffsetX, mapOffsetY, mapSizeX, mapSizeY });
        }

        let numNormalLMapIndices = this.readU32();
        let normalLMapIndices = [];
        for (let i = 0; i < numNormalLMapIndices; i++) {
            normalLMapIndices.push(this.readU8());
        }

        let numAlarmLMapIndices = this.readU32();
        let alarmLMapIndices = [];
        for (let i = 0; i < numAlarmLMapIndices; i++) {
            alarmLMapIndices.push(this.readU8());
        }
        
        let numNullSurfaces = this.readU32();
        let nullSurfaces = [];
        for (let i = 0; i < numNullSurfaces; i++) {
            let windingStart = this.readU32(),
                planeIndex = this.readU16(),
                surfaceFlags = this.readU8(),
                windingCount = this.readU8();

            nullSurfaces.push({ windingStart, planeIndex, surfaceFlags, windingCount });
        }

        let numLightmaps = this.readU32();
        let lightmaps = [];
        let lightDirMaps: unknown[] = [];
        let lightmapKeep: unknown[] = [];
        for (let i = 0; i < numLightmaps; i++) {
            let lightmap = this.readPNG();

            lightmaps.push(lightmap);
        }

        let numSolidLeafSurfaces = this.readU32();
        let solidLeafSurfaces = [];
        for (let i = 0; i < numSolidLeafSurfaces; i++) {
            solidLeafSurfaces.push(this.readU32());
        }

        let numAnimatedLights = this.readU32();
        let animatedLights = [];
        for (let i = 0; i < numAnimatedLights; i++) {
            let nameIndex = this.readU32(),
                stateIndex = this.readU32(),
                stateCount = this.readU16(),
                flags = this.readU16(),
                duration = this.readU32();

            animatedLights.push({ nameIndex, stateIndex, stateCount, flags, duration });
        }

        let numLightStates = this.readU32();
        let lightStates = [];
        for (let i = 0; i < numLightStates; i++) {
            let red = this.readU8(),
                green = this.readU8(),
                blue = this.readU8(),
                activeTime = this.readU32(),
                dataIndex = this.readU32(),
                dataCount = this.readU16();

            lightStates.push({ red, green, blue, activeTime, dataIndex, dataCount });
        }

        let numLightStateData = this.readU32();
        let lightStateData = [];
        for (let i = 0; i < numLightStateData; i++) {
            let surfaceIndex = this.readU32(),
                mapIndex = this.readU32(),
                lightStateIndex = this.readU16();

            lightStateData.push({ surfaceIndex, mapIndex, lightStateIndex });
        }

        let numLightStateDataBuffer = this.readU32();
        let lightStateDataBufferFlags = this.readU32();
        let lightStateDataBuffer = [];
        for (let i = 0; i < numLightStateDataBuffer; i++) {
            lightStateDataBuffer.push(this.readU8());
        }

        let numNameBuffer = this.readU32();
        let nameBuffer = [];
        for (let i = 0; i < numNameBuffer; i++) {
            nameBuffer.push(this.readU8());
        }

        let numSubObjects = this.readU32();
        let subObjects = [];
        for (let i = 0; i < numSubObjects; i++) {
            let soKey = this.readU32();

            subObjects.push({ soKey });
        }

        let numConvexHulls = this.readU32();
        let convexHulls = [];
        for (let i = 0; i < numConvexHulls; i++) {
            let hullStart = this.readU32(),
                hullCount = this.readU16(),
                minX = this.readF32(),
                maxX = this.readF32(),
                minY = this.readF32(),
                maxY = this.readF32(),
                minZ = this.readF32(),
                maxZ = this.readF32(),
                surfaceStart = this.readU32(),
                surfaceCount = this.readU16(),
                planeStart = this.readU32(),
                polyListPlaneStart = this.readU32(),
                polyListPointStart = this.readU32(),
                polyListStringStart = this.readU32(),
                staticMesh = false;
            convexHulls.push({ hullStart, hullCount, minX, maxX, minY, maxY, minZ, maxZ, surfaceStart, surfaceCount, planeStart, polyListPlaneStart, polyListPointStart, polyListStringStart, staticMesh });
        }

        // Idk what the fuck this is
        let numConvexHullEmitStrings = this.readU32();
        let convexHullEmitStrings = [];
        for (let i = 0; i < numConvexHullEmitStrings; i++) {
            convexHullEmitStrings.push(String.fromCharCode(this.readU8()));
        }

        let numHullIndices = this.readU32();
        let hullIndices = [];
        for (let i = 0; i < numHullIndices; i++) {
            hullIndices.push(this.readU32());
        }

        let numHullPlaneIndices = this.readU32();
        let hullPlaneIndices = [];
        for (let i = 0; i < numHullPlaneIndices; i++) {
            hullPlaneIndices.push(this.readU16());
        }

        let numHullEmitStringIndices = this.readU32();
        let hullEmitStringIndices = [];
        for (let i = 0; i < numHullEmitStringIndices; i++) {
            hullEmitStringIndices.push(this.readU32());
        }

        let numHullSurfaceIndices = this.readU32();
        let hullSurfaceIndices = [];
        for (let i = 0; i < numHullSurfaceIndices; i++) {
            hullSurfaceIndices.push(this.readU32());
        }

        let numPolyListPlanes = this.readU32();
        let polyListPlanes = [];
        for (let i = 0; i < numPolyListPlanes; i++) {
            polyListPlanes.push(this.readU16());
        }

        let numPolyListPoints = this.readU32();
        let polyListPoints = [];
        for (let i = 0; i < numPolyListPoints; i++) {
            polyListPoints.push(this.readU32());
        }

        let numPolyListStrings = this.readU32();
        let polyListStrings = [];
        for (let i = 0; i < numPolyListStrings; i++) {
            polyListStrings.push(String.fromCharCode(this.readU8()));
        }

        let coordBins = [];
        for (let i = 0; i < NUM_COORD_BINS**2; i++) {
            let binStart = this.readU32(),
                binCount = this.readU32();

            coordBins.push({ binStart, binCount });
        }

        let numCoordBinIndices = this.readU32();
        let coordBinIndices = [];
        for (let i = 0; i < numCoordBinIndices; i++) {
            coordBinIndices.push(this.readU16());
        }

        let coordBinMode = this.readU32();

        let baseAmbientColor = this.readColorF(),
            alarmAmbientColor = this.readColorF();

        let numStaticMeshes = this.readU32();
		
		numNormals = this.readU32();
		let numTexMatrices = this.readU32();
		let numTexMatIndices = this.readU32();

		/* SIKE SIKE SIKE
		let extendedLightMapData = this.readU32();

		if (extendedLightMapData === 1) {
			let lightMapBorderSize = this.readU32();
			this.readU32(); // dummy
		}*/

        return {
            interiorFileVersion: interiorFileVersion,
            detailLevel: detailLevel,
            minPixels: minPixels,
            boundingBox: boundingBox,
            boundingSphere: boundingSphere,
            hasAlarmState: hasAlarmState,
            numLightStateEntries: numLightStateEntries,
            normals: normals,
            planes: planes,
            points: points,
            pointVisibilities: pointVisibilities,
            texGenEqs: texGenEqs,
            bspNodes: bspNodes,
            bspSolidLeaves: bspSolidLeaves,
            materialList: materialList,
            windings: windings,
            windingIndices: windingIndices,
            edges: edges,
            zones: zones,
            zoneSurfaces: zoneSurfaces,
            zonePortalList: zonePortalList,
            portals: portals,
            surfaces: surfaces,
            normalLMapIndices: normalLMapIndices,
            alarmLMapIndices: alarmLMapIndices,
            nullSurfaces: nullSurfaces,
            lightmaps,
            lightDirMaps,
            lightmapKeep,
            solidLeafSurfaces,
            animatedLights,
            lightStates,
            lightStateData,
            lightStateDataBufferFlags,
            lightStateDataBuffer,
            nameBuffer,
            subObjects,
            convexHulls,
            convexHullEmitStrings,
            hullIndices,
            hullPlaneIndices,
            hullEmitStringIndices,
            hullSurfaceIndices,
            polyListPlanes,
            polyListPoints,
            polyListStrings,
            coordBins,
            coordBinIndices,
            coordBinMode,
            baseAmbientColor,
            alarmAmbientColor
        };
	}
	
	readLightMapTexGen(): LightMapTexGen {
        let finalWord = this.readU16(),
            texGenXDistance = this.readF32(),
            texGenYDistance = this.readF32();

        return { finalWord, texGenXDistance, texGenYDistance };
    }

    readPNG() {
        // Naive algorithm right now. Just look for the IEND.
        let start = this.index;

        for (this.index; this.index < this.buffer.byteLength; this.index++) {
            // Finds the IEND
            if (this.view.getUint8(this.index) === 0x49 && this.view.getUint8(this.index+1) === 0x45 && this.view.getUint8(this.index+2) === 0x4E && this.view.getUint8(this.index+3) === 0x44) {
                this.index += 4 + 5; // Skip an additional 5 forward
                return this.buffer.slice(start, this.index);
            }
        }

        throw new Error("PNG reading failed!");
    }

    readColorF(): ColorF {
        let red = this.readU8(),
            green = this.readU8(),
            blue = this.readU8(),
            alpha = this.readU8();

        return { red, green, blue, alpha };
	}

	static cachedFiles = new Map<string, Promise<DifFile>>();
	
	static loadFile(path: string) {
		if (this.cachedFiles.get(path)) return this.cachedFiles.get(path);

		let promise = new Promise<DifFile>(async (resolve) => {
			let blob = await ResourceManager.loadResource(path);
			let arrayBuffer = await blob.arrayBuffer();
			let parser = new DifParser(arrayBuffer);
	
			let result = parser.parse();
			resolve(result);
		});
		this.cachedFiles.set(path, promise);

		return promise;
	}
}