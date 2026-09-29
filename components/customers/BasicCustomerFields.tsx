export function BasicCustomerFields({
  fieldClassName,
  addressClassName = fieldClassName,
  addressRows,
}: {
  fieldClassName: string;
  addressClassName?: string;
  addressRows?: number;
}) {
  return (
    <>
      <input
        name="company_name"
        maxLength={200}
        placeholder="Company name"
        className={fieldClassName}
      />
      <input
        name="full_name"
        maxLength={200}
        placeholder="Full name / Contact person"
        className={fieldClassName}
      />
      <input
        name="email"
        type="email"
        maxLength={320}
        placeholder="Email (optional)"
        className={fieldClassName}
      />
      <input
        name="phone"
        required
        maxLength={50}
        placeholder="Phone"
        className={fieldClassName}
      />
      {addressRows ? (
        <textarea
          name="address_line_1"
          required
          maxLength={500}
          placeholder="Full address"
          rows={addressRows}
          className={addressClassName}
        />
      ) : (
        <input
          name="address_line_1"
          required
          maxLength={500}
          placeholder="Full address"
          className={addressClassName}
        />
      )}
    </>
  );
}
