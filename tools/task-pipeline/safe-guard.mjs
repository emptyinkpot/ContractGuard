const BLOCKED_PATTERNS = [
  /register\s+account/i,
  /auto\s+signup/i,
  /otp\s+bypass/i,
  /verification\s+code/i,
  /验证码/,
  /批量注册/,
  /真实密钥/,
  /api\s*key/i,
  /cookie/i,
  /password/i,
  /direct\s+provider/i,
  /绕过.*(限制|gate|pool|gateway)/i,
];

export function evaluateStepSafety(step) {
  const matches = BLOCKED_PATTERNS
    .filter((pattern) => pattern.test(step.prompt))
    .map((pattern) => pattern.toString());

  return {
    safe: matches.length === 0,
    matches,
  };
}
