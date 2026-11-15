/**
 * Fahrzeug-Optik – öffentlicher Einstieg. Braucht nur three.js; baut alles aus dem Daten-Layout der Physik.
 *   const visual = new VehicleVisual(describeLayout(spec, vehicle.built)); scene.add(visual.root);
 *   // pro Frame: visual.apply(snapshot)   (Snapshot: Worker-Interpolation oder writeVehicleSnapshot)
 */
export { VehicleVisual } from './VehicleVisual';
export { LinkRenderer, type BodyPoses } from './linkVisual';
export { JointRenderer } from './jointVisual';
export { createFrameVisual } from './frameVisual';
export { MAT } from './materials';
