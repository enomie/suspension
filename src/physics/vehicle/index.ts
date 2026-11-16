/**
 * vehicle kit (physics) — public entry. Needs only Rapier (+ three.js math).
 * Docs: src/docs/INTEGRATION_VEHICLE.md, src/docs/VEHICLE_KIT.md
 *
 *   const v = new Vehicle(R, world, PRESETS[0], { x, y, z });
 *   // per physics step (120 Hz):
 *   v.applyInput(input, 1 / 120); world.step(); v.updateTelemetry();
 */
export { Vehicle } from './Vehicle';
export { buildVehicle, type BuiltVehicle } from './buildVehicle';
export { describeLayout, poseBodies } from './layout';
export { writeVehicleSnapshot } from './snapshot';
export { PRESETS } from './presets';
export { car, makeCar } from './presets/car';
export { specFromWheelPoints, type WheelPoint, type WheelPointOptions } from './fromWheelPoints';
export { SUSPENSIONS } from './parts/suspension';
export { CHASSIS_GROUPS, WHEEL_GROUPS, GROUP_TERRAIN, GROUP_CHASSIS, GROUP_WHEEL, groups } from './groups';
export type * from '../../shared/vehicleSpec';
export type { VehicleLayout, BodyPoint } from '../../shared/vehicleLayout';
export type { Corner, LinkVisual, Attach } from './types';
