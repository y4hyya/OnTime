import {
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const policyStatusEnum = pgEnum("policy_status", [
  "quoted",
  "active",
  "claimable",
  "paid_out",
  "expired",
  "cancelled",
]);

export const claimStatusEnum = pgEnum("claim_status", [
  "submitted",
  "reviewing",
  "approved",
  "denied",
  "paid",
]);

export const chatAgentTypeEnum = pgEnum("chat_agent_type", [
  "quote",
  "claim",
  "support",
]);

export const flights = pgTable("flights", {
  id: uuid("id").primaryKey().defaultRandom(),
  iata: text("iata"),
  flightNumber: text("flight_number").notNull(),
  origin: text("origin").notNull(),
  destination: text("destination").notNull(),
  scheduledDepAt: timestamp("scheduled_dep_at", { withTimezone: true }).notNull(),
  scheduledArrAt: timestamp("scheduled_arr_at", { withTimezone: true }).notNull(),
  actualDepAt: timestamp("actual_dep_at", { withTimezone: true }),
  actualArrAt: timestamp("actual_arr_at", { withTimezone: true }),
  status: text("status"),
  lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const quotes = pgTable("quotes", {
  id: uuid("id").primaryKey().defaultRandom(),
  userClerkId: text("user_clerk_id").notNull(),
  inputJson: jsonb("input_json").notNull(),
  aiResponseJson: jsonb("ai_response_json"),
  premiumCents: integer("premium_cents").notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const policies = pgTable("policies", {
  id: uuid("id").primaryKey().defaultRandom(),
  userClerkId: text("user_clerk_id").notNull(),
  flightId: uuid("flight_id")
    .notNull()
    .references(() => flights.id),
  premiumCents: integer("premium_cents").notNull(),
  coverageType: text("coverage_type").notNull().default("parametric_delay"),
  status: policyStatusEnum("status").notNull().default("quoted"),
  stripePaymentId: text("stripe_payment_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const claims = pgTable("claims", {
  id: uuid("id").primaryKey().defaultRandom(),
  policyId: uuid("policy_id")
    .notNull()
    .references(() => policies.id),
  userClerkId: text("user_clerk_id").notNull(),
  narrative: text("narrative"),
  evidenceJson: jsonb("evidence_json"),
  aiRecommendation: jsonb("ai_recommendation"),
  status: claimStatusEnum("status").notNull().default("submitted"),
  payoutCents: integer("payout_cents"),
  triggeredTierIndex: integer("triggered_tier_index"),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const chatSessions = pgTable("chat_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userClerkId: text("user_clerk_id").notNull(),
  agentType: chatAgentTypeEnum("agent_type").notNull(),
  messagesJson: jsonb("messages_json").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const events = pgTable("events", {
  id: uuid("id").primaryKey().defaultRandom(),
  type: text("type").notNull(),
  payloadJson: jsonb("payload_json"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
