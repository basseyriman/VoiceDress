/**
 * CI / local self-check for live wardrobe category guards.
 * Run: npm run test:categories
 */
import { assertGarmentCategoryGuards } from "./garment-category";

assertGarmentCategoryGuards();
console.log("garment-category guards ok");
