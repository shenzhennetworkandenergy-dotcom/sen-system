import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeProfileInput,
  normalizeSocialLinks,
} from "../lib/profile/validation.ts";

test("normalizes personal, contact, location, work, and emergency fields", () => {
  assert.deepEqual(
    normalizeProfileInput({
      full_name: "  Shafayet Rahman  ",
      bio: "  Enterprise technology specialist  ",
      date_of_birth: "1995-05-10",
      gender: "male",
      pronouns: " he/him ",
      phone: " +8801712345678 ",
      alternate_phone: " +8801912345678 ",
      address_line: "  Gulshan 1 ",
      city: " Dhaka ",
      region: " Dhaka ",
      postal_code: " 1212 ",
      country_code: "bd",
      country_name: " Bangladesh ",
      company_name: " SEN ",
      job_title: " Director ",
      department: " Sales ",
      professional_summary: " Global sourcing ",
      emergency_contact_name: " Karim ",
      emergency_contact_relationship: " Brother ",
      emergency_contact_phone: " +8801812345678 ",
    }),
    {
      full_name: "Shafayet Rahman",
      bio: "Enterprise technology specialist",
      date_of_birth: "1995-05-10",
      gender: "male",
      pronouns: "he/him",
      phone: "+8801712345678",
      alternate_phone: "+8801912345678",
      address_line: "Gulshan 1",
      city: "Dhaka",
      region: "Dhaka",
      postal_code: "1212",
      country_code: "BD",
      country_name: "Bangladesh",
      company_name: "SEN",
      job_title: "Director",
      department: "Sales",
      professional_summary: "Global sourcing",
      emergency_contact_name: "Karim",
      emergency_contact_relationship: "Brother",
      emergency_contact_phone: "+8801812345678",
    },
  );
});

test("rejects invalid profile dates and gender values", () => {
  assert.throws(
    () => normalizeProfileInput({ date_of_birth: "not-a-date" }),
    /date of birth/i,
  );
  assert.throws(
    () => normalizeProfileInput({ gender: "unsupported" }),
    /gender/i,
  );
});

test("keeps only supported secure social links", () => {
  assert.deepEqual(
    normalizeSocialLinks({
      facebook: " https://facebook.com/sen ",
      linkedin: "https://linkedin.com/company/sen",
      website: "https://sen.com.bd",
      whatsapp: "+8801712345678",
      secret: "https://example.com",
      insecure: "javascript:alert(1)",
    }),
    {
      facebook: "https://facebook.com/sen",
      linkedin: "https://linkedin.com/company/sen",
      website: "https://sen.com.bd/",
      whatsapp: "+8801712345678",
    },
  );
});
