import { NextRequest } from "next/server";
import { z } from "zod";
import { recordScheduledJobRun } from "@/lib/observability";

const schema = z.object({
  cron:z.string().min(1).max(100),route:z.string().min(1).max(300),scheduledAt:z.string().datetime(),startedAt:z.string().datetime(),completedAt:z.string().datetime(),status:z.enum(["SUCCEEDED","FAILED"]),httpStatus:z.number().int().min(100).max(599).nullable().optional(),errorMessage:z.string().max(1000).nullable().optional(),
});

export async function POST(req: NextRequest) {
  const secret=process.env.CRON_SECRET;
  if(!secret||req.headers.get("authorization")!==`Bearer ${secret}`) return Response.json({error:"Unauthorized"},{status:401});
  const input=schema.parse(await req.json());
  await recordScheduledJobRun({cron:input.cron,route:input.route,scheduledAt:new Date(input.scheduledAt),startedAt:new Date(input.startedAt),completedAt:new Date(input.completedAt),status:input.status,httpStatus:input.httpStatus,errorMessage:input.errorMessage});
  return Response.json({ok:true});
}
