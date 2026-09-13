import { jsonOk } from "@/lib/api";
export async function GET(){return jsonOk({name:"GetSawa API",version:"v1",documentation:"/developers/api",authentication:"Authorization: Bearer <api-key>",resources:{domains:"/api/v1/domains",domainSearch:"/api/v1/domains/search",domainPricing:"/api/v1/domains/pricing",products:"/api/v1/products",orders:"/api/v1/orders",webhooks:"/api/v1/webhooks"}});}
