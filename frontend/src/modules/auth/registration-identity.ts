import { Prisma } from "@prisma/client";
import { REGISTRATION_WHITESPACE } from "./registration-otp";

// Trusted compile-time characters only. Inlined constants let PostgreSQL match the
// expression indexes even with a generic prepared plan. User values stay bound.
const unicodeLiteral = (characters: string) =>
  Prisma.raw(
    "U&'" +
      Array.from(
        characters,
        (character) =>
          "\\" + character.charCodeAt(0).toString(16).padStart(4, "0"),
      ).join("") +
      "'",
  );
const whitespace = unicodeLiteral(REGISTRATION_WHITESPACE);
const phoneSeparators = unicodeLiteral(REGISTRATION_WHITESPACE + "().-");

export function registrationIdentityQuery(email: string, phone: string) {
  return Prisma.sql`
    SELECT pg_catalog.row_security_active('public."User"'::regclass) AS filtered, EXISTS (
      SELECT 1 FROM (
        SELECT lower(btrim("email", ${whitespace})) AS email,
          translate(coalesce("phone", ''), ${phoneSeparators}, '') AS phone
        FROM public."User"
      ) identities
      WHERE email = ${email} OR
        CASE WHEN phone LIKE '0%' THEN '+62' || substring(phone FROM 2)
          WHEN phone LIKE '62%' THEN '+' || phone ELSE phone END = ${phone}
    ) AS conflict`;
}
