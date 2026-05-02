CREATE TYPE "public"."chat_agent_type" AS ENUM('quote', 'claim', 'support');--> statement-breakpoint
CREATE TYPE "public"."claim_status" AS ENUM('submitted', 'reviewing', 'approved', 'denied', 'paid');--> statement-breakpoint
CREATE TYPE "public"."policy_status" AS ENUM('quoted', 'active', 'claimable', 'paid_out', 'expired', 'cancelled');--> statement-breakpoint
CREATE TABLE "chat_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_clerk_id" text NOT NULL,
	"agent_type" "chat_agent_type" NOT NULL,
	"messages_json" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"policy_id" uuid NOT NULL,
	"user_clerk_id" text NOT NULL,
	"narrative" text,
	"evidence_json" jsonb,
	"ai_recommendation" jsonb,
	"status" "claim_status" DEFAULT 'submitted' NOT NULL,
	"payout_cents" integer,
	"triggered_tier_index" integer,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"payload_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "flights" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"iata" text,
	"flight_number" text NOT NULL,
	"origin" text NOT NULL,
	"destination" text NOT NULL,
	"scheduled_dep_at" timestamp with time zone NOT NULL,
	"scheduled_arr_at" timestamp with time zone NOT NULL,
	"actual_dep_at" timestamp with time zone,
	"actual_arr_at" timestamp with time zone,
	"status" text,
	"last_checked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_clerk_id" text NOT NULL,
	"flight_id" uuid NOT NULL,
	"premium_cents" integer NOT NULL,
	"coverage_type" text DEFAULT 'parametric_delay' NOT NULL,
	"status" "policy_status" DEFAULT 'quoted' NOT NULL,
	"stripe_payment_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_clerk_id" text NOT NULL,
	"input_json" jsonb NOT NULL,
	"ai_response_json" jsonb,
	"premium_cents" integer NOT NULL,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_policy_id_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."policies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policies" ADD CONSTRAINT "policies_flight_id_flights_id_fk" FOREIGN KEY ("flight_id") REFERENCES "public"."flights"("id") ON DELETE no action ON UPDATE no action;