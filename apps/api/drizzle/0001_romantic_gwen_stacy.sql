ALTER TABLE "canvas_connections" ADD CONSTRAINT "canvas_connections_user_id_unique" UNIQUE("user_id");--> statement-breakpoint
ALTER TABLE "whatsapp_connections" ADD CONSTRAINT "whatsapp_connections_user_id_unique" UNIQUE("user_id");--> statement-breakpoint
ALTER TABLE "whatsapp_connections" ADD CONSTRAINT "whatsapp_connections_phone_number_unique" UNIQUE("phone_number");