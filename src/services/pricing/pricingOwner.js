import {
  applyPricingProjection,
  assertSellPriceAvailable,
  resolvePricingState
} from '@/services/pricing/pricingCore';

export const pricingOwner = {
  resolvePricingState,
  applyPricingProjection,
  assertSellPriceAvailable
};

export default pricingOwner;
