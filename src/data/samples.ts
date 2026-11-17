export interface WorkflowSample {
  id: string;
  name: string;
  description: string;
  json: string;
}

const orderProcessingObj = {
  definition: {
    $schema:
      'https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#',
    contentVersion: '1.0.0.0',
    parameters: {
      HighValueThreshold: {
        type: 'Int',
        defaultValue: 1000,
      },
      ServiceBusQueueName: {
        type: 'String',
        defaultValue: 'standard-orders',
      },
    },
    triggers: {
      When_an_order_HTTP_request_is_received: {
        type: 'Request',
        kind: 'Http',
        inputs: {
          method: 'POST',
          relativePath: '/orders',
          schema: {
            type: 'object',
            properties: {
              orderId: { type: 'string' },
              customerTier: { type: 'string' },
              paymentMethod: { type: 'string' },
              total: { type: 'number' },
            },
            required: ['orderId', 'total'],
          },
        },
      },
    },
    actions: {
      Initialize_Order_Status: {
        type: 'InitializeVariable',
        runAfter: {},
        inputs: {
          variables: [
            {
              name: 'orderStatus',
              type: 'string',
              value: 'Pending',
            },
          ],
        },
      },
      Parse_Order_Payload: {
        type: 'ParseJson',
        runAfter: {
          Initialize_Order_Status: ['Succeeded'],
        },
        inputs: {
          content: '@triggerBody()',
          schema: {
            type: 'object',
            properties: {
              orderId: { type: 'string' },
              paymentMethod: { type: 'string' },
              total: { type: 'number' },
            },
          },
        },
      },
      Validate_High_Value_Order: {
        type: 'If',
        runAfter: {
          Parse_Order_Payload: ['Succeeded'],
        },
        expression: {
          and: [
            {
              greaterOrEquals: [
                "@body('Parse_Order_Payload')?['total']",
                "@parameters('HighValueThreshold')",
              ],
            },
          ],
        },
        actions: {
          Route_Payment_Method: {
            type: 'Switch',
            runAfter: {},
            expression: "@body('Parse_Order_Payload')?['paymentMethod']",
            cases: {
              CreditCard: {
                case: 'CreditCard',
                actions: {
                  Authorize_Card_Gateway: {
                    type: 'Http',
                    runAfter: {},
                    inputs: {
                      method: 'POST',
                      uri: 'https://payments.internal/api/v1/card/authorize',
                      body: {
                        orderId: "@body('Parse_Order_Payload')?['orderId']",
                        amount: "@body('Parse_Order_Payload')?['total']",
                      },
                    },
                  },
                },
              },
              PurchaseOrder: {
                case: 'PurchaseOrder',
                actions: {
                  Verify_Enterprise_Credit: {
                    type: 'Workflow',
                    runAfter: {},
                    inputs: {
                      host: {
                        workflow: {
                          id: 'credit-limit-check',
                        },
                      },
                      body: {
                        orderId: "@body('Parse_Order_Payload')?['orderId']",
                        amount: "@body('Parse_Order_Payload')?['total']",
                      },
                    },
                  },
                },
              },
            },
            default: {
              actions: {
                Mark_Manual_Review: {
                  type: 'SetVariable',
                  runAfter: {},
                  inputs: {
                    name: 'orderStatus',
                    value: 'ManualReview',
                  },
                },
              },
            },
          },
          Set_Priority_Status: {
            type: 'SetVariable',
            runAfter: {
              Route_Payment_Method: ['Succeeded'],
            },
            inputs: {
              name: 'orderStatus',
              value: 'PriorityApproved',
            },
          },
        },
        else: {
          actions: {
            Enqueue_Standard_Order: {
              type: 'ServiceProvider',
              runAfter: {},
              inputs: {
                parameters: {
                  entityName: "@parameters('ServiceBusQueueName')",
                  message: {
                    contentData: '@triggerBody()',
                  },
                },
                serviceProviderConfiguration: {
                  connectionName: 'serviceBus',
                  operationId: 'sendMessage',
                  serviceProviderId: '/serviceProviders/serviceBus',
                },
              },
            },
            Set_Queued_Status: {
              type: 'SetVariable',
              runAfter: {
                Enqueue_Standard_Order: ['Succeeded'],
              },
              inputs: {
                name: 'orderStatus',
                value: 'Queued',
              },
            },
          },
        },
      },
      Return_Order_Confirmation: {
        type: 'Response',
        kind: 'Http',
        runAfter: {
          Validate_High_Value_Order: ['Succeeded'],
        },
        inputs: {
          statusCode: 200,
          headers: {
            'Content-Type': 'application/json',
          },
          body: {
            orderId: "@body('Parse_Order_Payload')?['orderId']",
            status: "@variables('orderStatus')",
            processedAt: '@utcNow()',
          },
        },
      },
    },
    outputs: {
      finalOrderStatus: {
        type: 'String',
        value: "@variables('orderStatus')",
      },
    },
  },
  kind: 'Stateful',
};

const serviceBusBatchObj = {
  definition: {
    $schema:
      'https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#',
    contentVersion: '1.0.0.0',
    parameters: {
      ArchiveContainer: {
        type: 'String',
        defaultValue: 'telemetry-archive',
      },
    },
    triggers: {
      When_messages_arrive_on_Service_Bus: {
        type: 'ServiceProvider',
        kind: 'Polling',
        inputs: {
          parameters: {
            queueName: 'events-ingest',
            isSessionsEnabled: false,
          },
          serviceProviderConfiguration: {
            connectionName: 'serviceBus',
            operationId: 'receiveMessages',
            serviceProviderId: '/serviceProviders/serviceBus',
          },
        },
      },
    },
    actions: {
      Initialize_Processed_Count: {
        type: 'InitializeVariable',
        runAfter: {},
        inputs: {
          variables: [
            {
              name: 'processedCount',
              type: 'integer',
              value: 0,
            },
          ],
        },
      },
      For_Each_Batch_Message: {
        type: 'Foreach',
        foreach: '@triggerBody()',
        runAfter: {
          Initialize_Processed_Count: ['Succeeded'],
        },
        runtimeConfiguration: {
          concurrency: {
            repetitions: 10,
          },
        },
        actions: {
          Transform_Event_Payload: {
            type: 'Compose',
            runAfter: {},
            inputs: {
              eventId: "@items('For_Each_Batch_Message')?['messageId']",
              ingestedUtc: '@utcNow()',
              payload: "@items('For_Each_Batch_Message')?['contentData']",
            },
          },
          Archive_To_Blob: {
            type: 'ServiceProvider',
            runAfter: {
              Transform_Event_Payload: ['Succeeded'],
            },
            inputs: {
              parameters: {
                containerName: "@parameters('ArchiveContainer')",
                blobName: "@{items('For_Each_Batch_Message')?['messageId']}.json",
                content: "@outputs('Transform_Event_Payload')",
              },
              serviceProviderConfiguration: {
                connectionName: 'azureBlob',
                operationId: 'uploadBlob',
                serviceProviderId: '/serviceProviders/AzureBlob',
              },
            },
          },
          Upsert_SQL_Record: {
            type: 'ServiceProvider',
            runAfter: {
              Transform_Event_Payload: ['Succeeded'],
            },
            inputs: {
              parameters: {
                query: 'EXEC dbo.UpsertIngestEvent @EventJson',
              },
              serviceProviderConfiguration: {
                connectionName: 'sql',
                operationId: 'executeQuery',
                serviceProviderId: '/serviceProviders/sql',
              },
            },
          },
          Increment_Counter: {
            type: 'IncrementVariable',
            runAfter: {
              Archive_To_Blob: ['Succeeded'],
              Upsert_SQL_Record: ['Succeeded'],
            },
            inputs: {
              name: 'processedCount',
              value: 1,
            },
          },
        },
      },
      Complete_Batch_Summary: {
        type: 'Compose',
        runAfter: {
          For_Each_Batch_Message: ['Succeeded'],
        },
        inputs: {
          totalProcessed: "@variables('processedCount')",
          completedAt: '@utcNow()',
        },
      },
    },
    outputs: {},
  },
  kind: 'Stateless',
};

const tryCatchFinallyObj = {
  definition: {
    $schema:
      'https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#',
    contentVersion: '1.0.0.0',
    parameters: {
      CrmEndpoint: {
        type: 'String',
        defaultValue: 'https://crm.contoso.com/api/customers',
      },
    },
    triggers: {
      Every_15_Minutes_Recurrence: {
        type: 'Recurrence',
        recurrence: {
          frequency: 'Minute',
          interval: 15,
          timeZone: 'UTC',
        },
      },
    },
    actions: {
      Try_Sync_Customers: {
        type: 'Scope',
        runAfter: {},
        actions: {
          Fetch_CRM_Customers: {
            type: 'Http',
            runAfter: {},
            inputs: {
              method: 'GET',
              uri: "@parameters('CrmEndpoint')",
              headers: {
                Accept: 'application/json',
              },
            },
            retryPolicy: {
              type: 'exponential',
              count: 3,
              interval: 'PT10S',
            },
            timeout: 'PT2M',
          },
          Parse_CRM_Response: {
            type: 'ParseJson',
            runAfter: {
              Fetch_CRM_Customers: ['Succeeded'],
            },
            inputs: {
              content: '@body(\'Fetch_CRM_Customers\')',
              schema: {
                type: 'array',
              },
            },
          },
          Write_Customers_To_Storage: {
            type: 'ServiceProvider',
            runAfter: {
              Parse_CRM_Response: ['Succeeded'],
            },
            inputs: {
              parameters: {
                containerName: 'crm-sync',
                blobName: "@{formatDateTime(utcNow(), 'yyyy-MM-dd-HHmm')}.json",
                content: "@body('Parse_CRM_Response')",
              },
              serviceProviderConfiguration: {
                connectionName: 'azureBlob',
                operationId: 'uploadBlob',
                serviceProviderId: '/serviceProviders/AzureBlob',
              },
            },
          },
        },
      },
      Catch_Sync_Failure: {
        type: 'Scope',
        runAfter: {
          Try_Sync_Customers: ['Failed', 'TimedOut'],
        },
        actions: {
          Compose_Error_Details: {
            type: 'Compose',
            runAfter: {},
            inputs: {
              workflowRunId: "@workflow()['run']['name']",
              failedScope: "@result('Try_Sync_Customers')",
              timestamp: '@utcNow()',
            },
          },
          Send_Alert_Webhook: {
            type: 'Http',
            runAfter: {
              Compose_Error_Details: ['Succeeded'],
            },
            inputs: {
              method: 'POST',
              uri: 'https://alerts.contoso.com/hooks/logic-app-failures',
              body: "@outputs('Compose_Error_Details')",
            },
          },
        },
      },
      Finally_Audit_Status: {
        type: 'If',
        runAfter: {
          Try_Sync_Customers: ['Succeeded', 'Failed', 'TimedOut'],
          Catch_Sync_Failure: ['Succeeded', 'Skipped'],
        },
        expression: {
          equals: [
            "@actions('Try_Sync_Customers')['status']",
            'Succeeded',
          ],
        },
        actions: {
          Record_Sync_Success: {
            type: 'Compose',
            runAfter: {},
            inputs: {
              outcome: 'Succeeded',
              completedAt: '@utcNow()',
            },
          },
        },
        else: {
          actions: {
            Terminate_With_Failure: {
              type: 'Terminate',
              runAfter: {},
              inputs: {
                runStatus: 'Failed',
                runError: {
                  code: 'CustomerSyncFailed',
                  message: 'CRM customer synchronization failed and alert was dispatched.',
                },
              },
            },
          },
        },
      },
    },
    outputs: {},
  },
  kind: 'Stateful',
};

export const WORKFLOW_SAMPLES: WorkflowSample[] = [
  {
    id: 'order-processing',
    name: 'Order Processing API (Stateful · If / Switch)',
    description:
      'HTTP Request trigger with ParseJson, conditional high-value branching, Switch payment routing, and Service Bus queue.',
    json: JSON.stringify(orderProcessingObj, null, 2),
  },
  {
    id: 'servicebus-batch',
    name: 'Service Bus Batch Worker (Stateless · Foreach)',
    description:
      'Stateless built-in Service Bus trigger iterating messages with parallel Azure Blob archival and SQL Server upsert.',
    json: JSON.stringify(serviceBusBatchObj, null, 2),
  },
  {
    id: 'try-catch-finally',
    name: 'Try-Catch-Finally Scopes (RunAfter Failure Paths)',
    description:
      'Recurrence trigger demonstrating Scope error handling with Failed, TimedOut, and Skipped runAfter branches.',
    json: JSON.stringify(tryCatchFinallyObj, null, 2),
  },
];
