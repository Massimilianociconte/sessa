import { getCheckoutPolicy, getCustomerCancelHours, getLegalInfo } from "@/lib/services/commerce-settings";
import { SITE_URL } from "@/lib/site";

export async function getLegalContext() {
  const [legal, policy, cancelHours] = await Promise.all([getLegalInfo(), getCheckoutPolicy(), getCustomerCancelHours()]);
  return { legal, policy, cancelHours, siteUrl: SITE_URL };
}
