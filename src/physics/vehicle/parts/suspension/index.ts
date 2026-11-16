import type { SuspensionType } from '../../types';
import type { AxleBuilder } from './types';
import { buildStrut } from './strut';
import { buildDoubleWishbone } from './doubleWishbone';
import { buildMacPherson } from './macPherson';
import { buildSemiTrailingArm, buildTrailingArm } from './trailingArm';
import { buildSwingAxle } from './swingAxle';
import { buildSolidAxle } from './solidAxle';
import { buildTwistBeam } from './twistBeam';
import { buildMultiLink } from './multiLink';
import { buildBogie } from './bogie';
import { buildFourLink } from './fourLink';
import { buildTelescopicFork } from './telescopicFork';

/** SuspensionType → Achs-Builder */
export const SUSPENSIONS: Record<SuspensionType, AxleBuilder> = {
  strut: buildStrut,
  doubleWishbone: buildDoubleWishbone,
  macPherson: buildMacPherson,
  trailingArm: buildTrailingArm,
  semiTrailingArm: buildSemiTrailingArm,
  swingAxle: buildSwingAxle,
  solidAxle: buildSolidAxle,
  twistBeam: buildTwistBeam,
  multiLink: buildMultiLink,
  bogie: buildBogie,
  fourLink: buildFourLink,
  telescopicFork: buildTelescopicFork,
};
