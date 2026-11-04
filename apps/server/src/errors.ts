export class AppError extends Error {
  constructor(public status: number, message: string,public details?:{code:string;fieldId?:string;context?:string}) { super(message); }
}
