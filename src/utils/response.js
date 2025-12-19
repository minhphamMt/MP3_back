const buildResponse = (success, data, message, meta, errors) => {
  const payload = {
    success,
    data,
    message,
  };

  if (meta !== undefined && meta !== null) {
    payload.meta = meta;
  }
  if (errors !== undefined) {
    payload.errors = errors;
  }

  return payload;
};

export const successResponse = (
  res,
  data = null,
  meta = undefined,
  status = 200,
  message = "Success"
) => {
  const payload = buildResponse(true, data, message, meta);
  return res.status(status).json(payload);
};

export const errorResponse = (
  res,
  message = "An error occurred",
  status = 400,
  errors = undefined
) => {
  const payload = buildResponse(false, null, message, undefined, errors);

  return res.status(status).json(payload);
};

export default {
  successResponse,
  errorResponse,
};
