import { CheckoutError, type CheckoutInput } from "@/lib/checkout";
import { prisma } from "@/lib/prisma";
import { getProductCommerceMeta, validateProductConfiguration } from "@/lib/product-readiness";

export interface ValidatedProductCheckoutConfiguration { itemIndex:number; productId:string; domainId:string|null; configuration:Record<string,string>; }
function rawItems(body:unknown):unknown[]{if(!body||typeof body!=="object"||Array.isArray(body))return[];const items=(body as Record<string,unknown>).items;return Array.isArray(items)?items:[];}
function parseConfiguration(value:unknown):Record<string,string>{if(!value||typeof value!=="object"||Array.isArray(value))return{};const entries=Object.entries(value as Record<string,unknown>);if(entries.length>20)throw new CheckoutError("Product configuration contains too many fields.");const result:Record<string,string>={};for(const[key,raw]of entries){if(!/^[a-zA-Z0-9_.-]{1,64}$/.test(key))throw new CheckoutError("Product configuration contains an invalid field name.");if(typeof raw!=="string"||raw.length>500)throw new CheckoutError("Product configuration contains an invalid value.");result[key]=raw;}return result;}

export async function validateProductCheckoutConfigurations(rawBody:unknown,input:CheckoutInput,userId:string):Promise<ValidatedProductCheckoutConfiguration[]>{
  const sourceItems=rawItems(rawBody);if(sourceItems.length!==input.items.length)throw new CheckoutError("Checkout configuration does not match the cart.");const validated:ValidatedProductCheckoutConfiguration[]=[];
  for(let index=0;index<input.items.length;index++){
    const item=input.items[index];if(!item||item.kind!=="PRODUCT")continue;const raw=sourceItems[index];if(!raw||typeof raw!=="object"||Array.isArray(raw))throw new CheckoutError("Product configuration is invalid.");
    const rawObject=raw as Record<string,unknown>;const domainId=typeof rawObject.domainId==="string"&&rawObject.domainId.trim()?rawObject.domainId.trim():undefined;const configuration=parseConfiguration(rawObject.configuration);
    const product=await prisma.product.findUnique({where:{sku:item.sku}});if(!product)throw new CheckoutError("This product is no longer available.");const meta=await getProductCommerceMeta(product.id);if(!meta)throw new CheckoutError("Product commerce configuration is unavailable.");
    if(meta.requiresDomain){if(!["HOSTING_ACCOUNT","EMAIL_MAILBOX","CLOUDFLARE_ZONE"].includes(meta.provisioningContract||""))throw new CheckoutError("This service requires provider-specific configuration that is not yet available for checkout.");try{const selection=await validateProductConfiguration({product,userId,domainId,configuration});validated.push({itemIndex:index,productId:product.id,domainId:selection.domain?.id??null,configuration:selection.configuration});}catch(error){throw new CheckoutError(error instanceof Error?error.message:"Product configuration could not be validated.");}continue;}
    validated.push({itemIndex:index,productId:product.id,domainId:null,configuration});
  }
  return validated;
}
