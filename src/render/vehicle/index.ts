/**
 * vehicle rendering — public entry. Needs only three.js; builds everything from physics data layout.
 *   const visual = new VehicleVisual(describeLayout(spec, vehicle.built)); scene.add(visual.root);
 *   // per frame: visual.apply(snapshot)   (snapshot: worker interpolation or writeVehicleSnapshot)
 */
export { VehicleVisual, DEFAULT_TOGGLES, type VisualToggles } from './VehicleVisual';
export { LinkRenderer, type BodyPoses } from './linkVisual';
export { JointRenderer } from './jointVisual';
export { createMountPlates } from './mountVisual';
export { createFrameVisual } from './frameVisual';
export { createDifferentialMarkers } from './differentialVisual';
export { createComMarker } from './comVisual';
export { createPreviewBox } from './previewBoxVisual';
export { MAT } from './materials';
