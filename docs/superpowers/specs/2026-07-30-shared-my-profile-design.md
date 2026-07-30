# Shared My Profile Design

## Goal

Give customers, employees, and administrators one consistent **My Profile** experience where they can easily add, edit, and maintain personal information.

## Navigation

- Use `/profile` as the canonical profile route for every authenticated role.
- Redirect the existing `/account/profile` route to `/profile`.
- Keep employee workplace management separate because it affects operational inventory controls.
- Replace customer-facing **My Account** wording with **My Profile** where the link represents the person rather than the broader customer dashboard.
- Add **My Profile** to the administrator and employee dashboard navigation.
- Add a small circular profile image beside **My Profile** in authenticated public and dashboard headers.
- When no uploaded image exists, display the selected emoji avatar or the person’s initials.

## Profile experience

The page uses a social-profile-style header followed by focused editable cards. It is inspired by the ease of Facebook profile editing without creating a public social network.

### Profile header

- Circular profile picture
- Optional cover image
- Full name
- Short bio
- Role label
- Edit buttons close to the information they affect

### About

- Full name
- Short bio
- Date of birth
- Gender
- Pronouns

### Contact

- Login email, displayed read-only
- Primary phone
- Alternate phone
- Website

### Location

- Address line
- City
- Region or state
- Postal code
- Country

### Work

- Company
- Job title
- Department
- Professional summary

### Social links

- Facebook
- LinkedIn
- WhatsApp
- Additional website

### Emergency contact

- Contact name
- Relationship
- Phone

Each section saves independently. Empty optional fields remain hidden from the profile summary and can be added through an **Add information** action.

## Privacy and authorization

- Profile information is private to the account owner and authorized administrators.
- It is not exposed as a public profile page.
- Every profile action authenticates the current user and updates only that user’s record.
- Administrators continue to manage account roles and permissions from the existing user administration pages.
- Login email changes remain outside this form because they require a verified authentication workflow.
- Uploaded profile and cover images use private storage with signed URLs, file-type validation, and size limits.
- Profile changes are recorded in the audit log without storing sensitive file contents.

## Data model

Extend `profiles` with optional structured fields for biography, personal, location, work, social, emergency-contact, and cover-image data. Prefer explicit columns for commonly queried information and a constrained JSON object only for social links. Existing avatar fields remain compatible.

## Responsiveness and accessibility

- On mobile, the profile header, editing controls, and cards stack vertically.
- Forms use visible labels, appropriate input types, keyboard navigation, and clear validation messages.
- Images have useful alternative text.
- The profile photo control remains usable without drag-and-drop.

## Testing

- Test profile input normalization and allowed social-link keys.
- Test that account owners cannot update another profile.
- Test image validation and route compatibility.
- Verify customer, employee, and administrator navigation.
- Verify the profile page at mobile and desktop widths.

