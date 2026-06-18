# GhostPay 👻

GhostPay is a fast, serverless payment and merchant management backend built on AWS. It enables AI-driven interactions, including WhatsApp and voice-based conversational commerce using Gemini and Whisper integrations, alongside standard payment processing via Kora.

## Key Features

- **Serverless Architecture**: Built with AWS Serverless Application Model (SAM) and running on AWS Lambda.
- **Payment Processing**: Integrated with Kora for handling charges and processing webhook events reliably.
- **AI Conversational Commerce**: Connects to WhatsApp and translates voice inputs to text using OpenAI Whisper. It uses LLMs (Gemini/YarnGPT) to parse intents, process charges, and retrieve transactions conversationally.
- **Merchant Services**: Robust support for merchant registration, secure authentication, and account verification.
- **Real-Time Notifications**: Uses Firebase Cloud Messaging (FCM) to push real-time transaction updates directly to merchant devices.
- **Resilient & Safe**: Implements robust idempotency keys and retry utilities to prevent duplicate transactions.

## Project Structure

- `src/handlers/` - AWS Lambda entry points (e.g., Merchant Auth, Kora Webhooks, Voice Ingestion, Querying Charges).
- `src/services/` - External API and service implementations (WhatsApp, Whisper, Gemini/YarnGPT, Kora Payments, FCM).
- `src/db/` - Database abstractions (Merchants, Transactions, Idempotency tracking).
- `src/middleware/` - Custom Lambda handlers and Authorization guards.
- `src/utils/` - Shared utilities like speech processing, logging, formatting, and retry logic.

## Prerequisites

- [Node.js](https://nodejs.org/) (v18+ recommended)
- [AWS CLI](https://aws.amazon.com/cli/) configured with your AWS credentials
- [AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/serverless-sam-cli-install.html)

## Setup & Deployment

1. **Install Dependencies**
   Navigate to the `ghost-pay-aws` directory and install the required Node.js packages:
   ```bash
   cd ghost-pay-aws
   npm install
   # or yarn install
   ```

2. **Build the Application**
   Use SAM to build the project and compile TypeScript:
   ```bash
   sam build
   ```

3. **Local Testing**
   You can invoke functions locally using the SAM CLI:
   ```bash
   sam local invoke "FunctionName" -e events/event.json
   ```

4. **Deploy to AWS**
   Deploy the application securely to your AWS account:
   ```bash
   sam deploy --guided
   ```
   Follow the interactive prompts to configure your AWS region, stack name, and parameter overrides. Subsequent deployments can securely be run with just `sam deploy`.

## Environment Variables & Configuration

This project relies on several third-party integrations and standard environment settings. It is recommended to manage these via AWS Secrets Manager and reference them in your `template.yaml`.

Key integrations include:
- **Kora API**: API/Secret keys for processing payments.
- **WhatsApp API**: Webhook verification and meta tokens.
- **AI Models**: Gemini API keys, OpenAI (Whisper) keys.
- **Firebase**: FCM configuration for push notifications.

## License
MIT
