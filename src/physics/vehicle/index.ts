/**
 * vehicle kit (physics) — public entry. Needs only Rapier (+ three.js math).
 * Docs: src/docs/INTEGRATION_VEHICLE.md, src/docs/VEHICLE_KIT.md
 *
 *   const v = new Vehicle(R, world, PRESETS[0], { x, y, z });
 *   // per physics step (120 Hz):
 *   v.applyInput(input, 1 / 120); world.step(); v.updateTelemetry();
 *
 * Tracked vehicles: `TrackedVehicle` (or `createVehicle`, which picks wheeled or tracked from the spec), see src/docs/TRACKED_VEHICLE.md
 */
export { Vehicle } from './Vehicle';
export { buildVehicle, type BuiltVehicle } from './buildVehicle';
export { describeLayout, poseBodies } from './layout';
export { writeVehicleSnapshot } from './snapshot';
export { PRESETS, ALL_PRESETS } from './presets';
export { TrackedVehicle } from './tracked/TrackedVehicle';
export { buildTrackedVehicle, trackContactAxles, type BuiltTracked } from './tracked/buildTracked';
export { applyTrackDrive } from './tracked/applyTrackDrive';
export { createVehicle } from './createVehicle';
export type { SimVehicle } from './simVehicle';
export { TRACKED_PRESETS, tank } from './presets/tracked';
export { isTrackedSpec, validateTrackedSpec, designChainWheels, trackedRenderSpec, TRACKED_LIMITS, type TrackedVehicleSpec, type TrackEndWheelSpec } from '../../shared/trackedSpec';
export { trackCommand, DEFAULT_TURN_SPEED, type TrackCommand, type TrackDriveParams } from '../../shared/trackDrive';
export { buildChainLoop, linkLayout, type ChainLoop, type ChainCircle, type ChainPose } from '../../shared/chainLoop';
export { PLACEHOLDER_CHAIN_LINK, parseChainLink, type ChainLinkAsset } from '../../shared/chainLink';
export { neutralInput, type DriverInput } from '../../shared/driverInput';
export { car, makeCar } from './presets/car';
export { specFromWheelPoints, type WheelPoint, type WheelPointOptions } from './fromWheelPoints';
export { SUSPENSIONS } from './parts/suspension';
export { CHASSIS_GROUPS, WHEEL_GROUPS, GROUP_TERRAIN, GROUP_CHASSIS, GROUP_WHEEL, groups } from './groups';
export type * from '../../shared/vehicleSpec';
export type { VehicleLayout, BodyPoint } from '../../shared/vehicleLayout';
export type { Corner, LinkVisual, Attach } from './types';
