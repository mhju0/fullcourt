export function safeError(error:unknown):string {
  let message=error instanceof Error?error.message:'Overtime correction failed';
  for(const value of [process.env.OVERTIME_CORRECTION_DATABASE_URL,process.env.DATABASE_URL]) {
    if(!value)continue;
    message=message.replaceAll(value,'[database URL redacted]');
    try{const password=new URL(value).password;if(password){message=message.replaceAll(password,'[password redacted]').replaceAll(decodeURIComponent(password),'[password redacted]');}}catch{ /* Invalid connection strings are still removed above. */ }
  }
  return message.replace(/postgres(?:ql)?:\/\/[^\s"'<>]+/gi,'[database URL redacted]');
}
