# API Contract: Auth Module

## POST /auth/otp/request
Request OTP code via SMS.

**Request Body**:
```typescript
z.object({
  phone: z.string().regex(/^\+229\d{8}$/), // Benin phone format
})
```

**Response 200**:
```typescript
z.object({
  message: z.string(), // "OTP envoyé"
  expiresIn: z.number(), // seconds (300)
})
```

**Rate limit**: 3 requests per phone per 10 minutes.

---

## POST /auth/otp/verify
Verify OTP and create session.

**Request Body**:
```typescript
z.object({
  phone: z.string(),
  code: z.string().length(6),
})
```

**Response 200**:
```typescript
z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  user: userResponseSchema,
  isNewUser: z.boolean(),
})
```

---

## POST /auth/refresh
Refresh access token (rotation).

**Request Body**:
```typescript
z.object({
  refreshToken: z.string(),
})
```

**Response 200**:
```typescript
z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
})
```

---

## POST /auth/admin/login
Admin login with email + password + OTP 2FA.

**Request Body**:
```typescript
z.object({
  email: z.string().email(),
  password: z.string().min(8),
})
```

**Response 200** (step 1 — triggers OTP):
```typescript
z.object({
  requiresOtp: z.literal(true),
  tempToken: z.string(),
})
```

---

## POST /auth/admin/verify-otp
Complete admin 2FA.

**Request Body**:
```typescript
z.object({
  tempToken: z.string(),
  code: z.string().length(6),
})
```

**Response 200**:
```typescript
z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  admin: adminResponseSchema,
})
```

---

## POST /auth/biometric/enable
Enable biometric unlock for current device.

**Headers**: `Authorization: Bearer <token>`

**Request Body**:
```typescript
z.object({
  deviceId: z.string(),
  biometricKey: z.string(),
})
```

**Response 200**: `{ success: true }`

---

## POST /auth/biometric/verify
Login via biometric.

**Request Body**:
```typescript
z.object({
  deviceId: z.string(),
  biometricKey: z.string(),
})
```

**Response 200**: Same as `/auth/otp/verify`.
