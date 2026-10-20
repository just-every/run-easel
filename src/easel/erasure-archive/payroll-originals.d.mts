export type PayrollOriginalScope = {
 providerHash: string;
 employeeHash: string;
 originals: { sha256: string; jobId: string; columns: { employeeId: string; name?: string }; sheet?: string }[];
};
export function transformPayrollOriginal(
 inputBytes: Uint8Array,
 maps: { pseudonym: string; payrollScopes?: PayrollOriginalScope[] }[],
 jobId?: string,
): Promise<Uint8Array>;
