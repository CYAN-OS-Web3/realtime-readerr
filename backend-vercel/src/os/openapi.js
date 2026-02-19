const pkg = { name: 'translator-backend', version: '0.0.0' }
try {
  Object.assign(pkg, require('../../package.json'))
} catch (e) {}

function buildOpenApiSpec(baseUrl){
  const servers = []
  if (baseUrl) servers.push({ url: baseUrl })
  if (servers.length === 0) servers.push({ url: 'https://<your-domain>' })

  return {
    openapi: '3.0.3',
    info: {
      title: 'Cyan API (Cyan-OS lite)',
      version: pkg.version || '0.0.0',
      description: 'Realtime speech translation backend APIs with Cyan-OS lite (routing, policy, telemetry).'
    },
    servers,
    tags: [
      { name: 'Core' },
      { name: 'OS' },
      { name: 'TTS' },
      { name: 'User' },
      { name: 'Voice' },
      { name: 'Payment' },
      { name: 'PayPal' },
      { name: 'Ocean' }
    ],
    components: {
      securitySchemes: {
        RapidApiKey: {
          type: 'apiKey',
          in: 'header',
          name: 'X-RapidAPI-Key',
          description: 'Managed by RapidAPI. End-users should call via RapidAPI Gateway using this key.'
        }
      },
      parameters: {
        SessionIdHeader: {
          name: 'x-session-id',
          in: 'header',
          required: false,
          schema: { type: 'string' },
          description: 'Client session id for Cyan-OS lite correlation. Recommended to set device_id or a UUID.'
        },
        OceanProxySecret: {
          name: 'x-ocean-proxy-secret',
          in: 'header',
          required: true,
          schema: { type: 'string' },
          description: 'Shared secret between Ocean provider gateway and this API.'
        },
        OceanConsumer: {
          name: 'x-ocean-consumer',
          in: 'header',
          required: true,
          schema: { type: 'string' },
          description: 'Ocean consumer wallet or identifier.'
        }
      },
      schemas: {
        Ok: {
          type: 'object',
          properties: { ok: { type: 'boolean' } },
          required: ['ok']
        },
        OsStatus: {
          type: 'object',
          properties: {
            ok: { type: 'boolean' },
            providers: {
              type: 'object',
              properties: {
                elevenlabs: { type: 'boolean' },
                google: { type: 'boolean' },
                azure: { type: 'boolean' }
              },
              required: ['elevenlabs', 'google', 'azure']
            }
          },
          required: ['ok', 'providers']
        },
        Error: {
          type: 'object',
          properties: { error: { type: 'string' } },
          required: ['error']
        },
        TtsSpeakRequest: {
          type: 'object',
          properties: {
            text: { type: 'string' },
            user_id: { type: 'string', description: 'Supabase user UUID.' },
            device_id: { type: 'string', nullable: true },
            language: { type: 'string', example: 'en-US' },
            gender: { type: 'string', enum: ['female', 'male'] }
          },
          required: ['text', 'user_id']
        },
        OceanTtsSpeakRequest: {
          type: 'object',
          properties: {
            text: { type: 'string' },
            language: { type: 'string', example: 'en-US' },
            gender: { type: 'string', enum: ['female', 'male'] },
            voice_id: { type: 'string', description: 'Optional ElevenLabs voice id if Ocean allows ElevenLabs.' }
          },
          required: ['text']
        },
        Plan: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            price: { type: 'number' },
            currency: { type: 'string' }
          }
        },
        Quota: {
          type: 'object',
          properties: {
            ok: { type: 'boolean' },
            plan: { type: 'string' },
            used: { type: 'number' },
            limit: { type: 'number' },
            percent: { type: 'number' }
          }
        },
        PayPalVoiceOrderRequest: {
          type: 'object',
          properties: {
            userId: { type: 'string', description: 'Supabase user UUID.' },
            deviceId: { type: 'string', description: 'Device identifier.' },
            voiceId: { type: 'string', description: 'ElevenLabs voice ID to save.' },
            price: { type: 'string', example: '4.99', description: 'Price in USD.' },
            currency: { type: 'string', example: 'USD' }
          },
          required: ['userId', 'deviceId', 'voiceId']
        },
        PayPalVoiceOrderResponse: {
          type: 'object',
          properties: {
            orderId: { type: 'string' },
            approvalUrl: { type: 'string', description: 'PayPal approval URL for user to complete payment.' },
            price: { type: 'string' },
            currency: { type: 'string' }
          },
          required: ['orderId', 'approvalUrl', 'price', 'currency']
        }
      }
    },
    security: [{ RapidApiKey: [] }],
    paths: {
      '/api/health': {
        get: {
          tags: ['Core'],
          summary: 'Health check',
          security: [],
          responses: {
            200: {
              description: 'OK',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/Ok' } } }
            }
          }
        }
      },
      '/api/ocean/tts/speak': {
        post: {
          tags: ['Ocean'],
          summary: 'Ocean TTS speak (pay-per-call via Ocean gateway)',
          parameters: [
            { $ref: '#/components/parameters/OceanProxySecret' },
            { $ref: '#/components/parameters/OceanConsumer' },
            { $ref: '#/components/parameters/SessionIdHeader' }
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/OceanTtsSpeakRequest' } }
            }
          },
          responses: {
            200: { description: 'Audio', content: { 'audio/mpeg': { schema: { type: 'string', format: 'binary' } } } },
            401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
            429: { description: 'Ocean quota exceeded', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
          }
        }
      },
      '/api/ocean/tts/clone-and-speak': {
        post: {
          tags: ['Ocean'],
          summary: 'Ocean clone voice then speak (one-shot)',
          parameters: [
            { $ref: '#/components/parameters/OceanProxySecret' },
            { $ref: '#/components/parameters/OceanConsumer' },
            { $ref: '#/components/parameters/SessionIdHeader' }
          ],
          requestBody: {
            required: true,
            content: {
              'multipart/form-data': {
                schema: {
                  type: 'object',
                  properties: {
                    sample: { type: 'string', format: 'binary' },
                    text: { type: 'string' },
                    quality: { type: 'string', example: 'high' }
                  },
                  required: ['sample', 'text']
                }
              }
            }
          },
          responses: {
            200: { description: 'Audio', content: { 'audio/mpeg': { schema: { type: 'string', format: 'binary' } } } },
            401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
            429: { description: 'Ocean quota exceeded', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
          }
        }
      },
      '/api/ocean/tts/clone-and-stream': {
        post: {
          tags: ['Ocean'],
          summary: 'Ocean clone voice then stream audio (chunked)',
          parameters: [
            { $ref: '#/components/parameters/OceanProxySecret' },
            { $ref: '#/components/parameters/OceanConsumer' },
            { $ref: '#/components/parameters/SessionIdHeader' }
          ],
          requestBody: {
            required: true,
            content: {
              'multipart/form-data': {
                schema: {
                  type: 'object',
                  properties: {
                    sample: { type: 'string', format: 'binary' },
                    text: { type: 'string' },
                    quality: { type: 'string', example: 'high' }
                  },
                  required: ['sample', 'text']
                }
              }
            }
          },
          responses: {
            200: { description: 'Streaming audio', content: { 'audio/mpeg': { schema: { type: 'string', format: 'binary' } } } },
            401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
            429: { description: 'Ocean quota exceeded', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
          }
        }
      },
      '/api/ocean/tts/speak-chunked': {
        post: {
          tags: ['Ocean'],
          summary: 'Ocean chunked TTS (streamed audio)',
          parameters: [
            { $ref: '#/components/parameters/OceanProxySecret' },
            { $ref: '#/components/parameters/OceanConsumer' },
            { $ref: '#/components/parameters/SessionIdHeader' }
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/OceanTtsSpeakRequest' } }
            }
          },
          responses: {
            200: { description: 'Streaming audio', content: { 'application/octet-stream': { schema: { type: 'string', format: 'binary' } } } },
            401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
            429: { description: 'Ocean quota exceeded', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
          }
        }
      },
      '/api/_prewarm': {
        get: {
          tags: ['Core'],
          summary: 'Prewarm function (reduce cold start)',
          security: [],
          responses: {
            200: {
              description: 'OK',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/Ok' } } }
            }
          }
        }
      },
      '/api/docs': {
        get: {
          tags: ['Core'],
          summary: 'Swagger UI',
          security: [],
          responses: {
            200: { description: 'HTML', content: { 'text/html': { schema: { type: 'string' } } } }
          }
        }
      },
      '/api/openapi.json': {
        get: {
          tags: ['Core'],
          summary: 'OpenAPI specification',
          security: [],
          responses: {
            200: { description: 'OK', content: { 'application/json': { schema: { type: 'object' } } } }
          }
        }
      },
      '/api/os/status': {
        get: {
          tags: ['OS'],
          summary: 'Cyan-OS lite status (provider availability)',
          responses: {
            200: { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/OsStatus' } } } }
          }
        }
      },
      '/api/plans': {
        get: {
          tags: ['User'],
          summary: 'List plans',
          responses: {
            200: {
              description: 'OK',
              content: {
                'application/json': {
                  schema: { type: 'array', items: { $ref: '#/components/schemas/Plan' } }
                }
              }
            }
          }
        }
      },
      '/api/user/quota': {
        get: {
          tags: ['User'],
          summary: 'Get user quota',
          parameters: [
            { name: 'user_id', in: 'query', required: true, schema: { type: 'string' } }
          ],
          responses: {
            200: { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/Quota' } } } },
            404: { description: 'Not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
          }
        }
      },
      '/api/user/history': {
        get: {
          tags: ['User'],
          summary: 'Get translation history',
          parameters: [
            { name: 'user_id', in: 'query', required: true, schema: { type: 'string' } }
          ],
          responses: {
            200: { description: 'OK', content: { 'application/json': { schema: { type: 'array', items: { type: 'object' } } } } }
          }
        }
      },
      '/api/tts/speak': {
        post: {
          tags: ['TTS'],
          summary: 'Speak text (routed by Cyan-OS lite)',
          parameters: [{ $ref: '#/components/parameters/SessionIdHeader' }],
          requestBody: {
            required: true,
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/TtsSpeakRequest' } }
            }
          },
          responses: {
            200: {
              description: 'Audio',
              headers: {
                'x-request-id': { schema: { type: 'string' }, description: 'Request id for correlation.' }
              },
              content: { 'audio/mpeg': { schema: { type: 'string', format: 'binary' } } }
            },
            429: { description: 'Rate limit', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
          }
        }
      },
      '/api/tts/clone-and-speak': {
        post: {
          tags: ['TTS'],
          summary: 'Clone voice from sample then speak (one-shot)',
          parameters: [{ $ref: '#/components/parameters/SessionIdHeader' }],
          requestBody: {
            required: true,
            content: {
              'multipart/form-data': {
                schema: {
                  type: 'object',
                  properties: {
                    sample: { type: 'string', format: 'binary' },
                    text: { type: 'string' },
                    user_id: { type: 'string' },
                    quality: { type: 'string', example: 'high' }
                  },
                  required: ['sample', 'text', 'user_id']
                }
              }
            }
          },
          responses: {
            200: { description: 'Audio', content: { 'audio/mpeg': { schema: { type: 'string', format: 'binary' } } } },
            403: { description: 'Unavailable', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
            429: { description: 'Rate limit', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
          }
        }
      },
      '/api/tts/clone-and-stream': {
        post: {
          tags: ['TTS'],
          summary: 'Clone voice then stream audio (chunked)',
          description: 'Returns chunked audio/mpeg stream. Use MediaSource (MSE) or save to file.',
          parameters: [{ $ref: '#/components/parameters/SessionIdHeader' }],
          requestBody: {
            required: true,
            content: {
              'multipart/form-data': {
                schema: {
                  type: 'object',
                  properties: {
                    sample: { type: 'string', format: 'binary' },
                    text: { type: 'string' },
                    user_id: { type: 'string' },
                    quality: { type: 'string', example: 'high' }
                  },
                  required: ['sample', 'text', 'user_id']
                }
              }
            }
          },
          responses: {
            200: {
              description: 'Streaming audio',
              headers: {
                'x-request-id': { schema: { type: 'string' }, description: 'Request id for correlation.' }
              },
              content: { 'audio/mpeg': { schema: { type: 'string', format: 'binary' } } }
            },
            403: { description: 'Unavailable', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
            429: { description: 'Rate limit', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
          }
        }
      },
      '/api/paypal/voice-order/create': {
        post: {
          tags: ['PayPal'],
          summary: 'Create PayPal order to save a voice ID for a device',
          requestBody: {
            required: true,
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/PayPalVoiceOrderRequest' } }
            }
          },
          responses: {
            200: { description: 'Order created', content: { 'application/json': { schema: { $ref: '#/components/schemas/PayPalVoiceOrderResponse' } } } },
            400: { description: 'Bad request', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
            500: { description: 'Server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
          }
        }
      },
      '/api/paypal/webhook': {
        post: {
          tags: ['PayPal'],
          summary: 'PayPal webhook (captures payment and saves voice ID)',
          security: [],
          responses: {
            200: { description: 'OK' },
            401: { description: 'Invalid signature' },
            500: { description: 'Server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
          }
        }
      }
    }
  }
}

module.exports = { buildOpenApiSpec }
