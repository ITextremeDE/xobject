import {ZodError} from 'zod';
export class AppError extends Error {
  constructor(public status: number, message: string,public details?:{code:string;fieldId?:string;context?:string}) { super(message); }
}

const httpCodes:Record<number,string>={400:'invalid_input',401:'unauthenticated',403:'forbidden',404:'not_found',409:'conflict',429:'rate_limited',500:'internal_error'};
export function apiError(error:unknown){
 if(error instanceof AppError)return {error:error.message,code:error.details?.code??httpCodes[error.status]??'request_failed',...(error.details?{details:error.details}:{})};
 if(error instanceof ZodError)return {error:'Invalid input',code:'invalid_input',issues:error.issues};
 return {error:'Internal server error',code:'internal_error'};
}
