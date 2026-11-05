import { describe, expect, it } from "vitest";
import { isEmailConfigured, parseServerEnv } from "./env";

const valid = {
  NODE_ENV: "test",
  MONGODB_URI: "mongodb://localhost:27017/rds_crm",
  AUTH_SECRET: "x".repeat(32),
  APP_URL: "https://crm.example.com/",
};

describe("parseServerEnv", () => {
  it("accepts a minimal valid environment", () => {
    const env = parseServerEnv(valid);
    expect(env.APP_URL).toBe("https://crm.example.com");
    expect(env.SMTP_PORT).toBe(587);
    expect(isEmailConfigured(env)).toBe(false);
  });

  it("treats empty optional values as unset", () => {
    const env = parseServerEnv({ ...valid, SMTP_HOST: "", SMTP_PORT: "" });
    expect(env.SMTP_HOST).toBeUndefined();
    expect(env.SMTP_PORT).toBe(587);
  });

  it("reports every missing or invalid variable without echoing values", () => {
    const secret = "short-secret";
    let message = "";
    try {
      parseServerEnv({ AUTH_SECRET: secret });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain("MONGODB_URI");
    expect(message).toContain("AUTH_SECRET");
    expect(message).toContain("APP_URL");
    expect(message).not.toContain(secret);
  });

  it("detects complete SMTP configuration", () => {
    const env = parseServerEnv({
      ...valid,
      SMTP_HOST: "smtp.example.com",
      SMTP_USER: "user",
      SMTP_PASSWORD: "pass",
      MAIL_FROM: "RDS <no-reply@example.com>",
    });
    expect(isEmailConfigured(env)).toBe(true);
  });
});
