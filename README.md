# Synapse — AI-Powered Developer Workspace

<p align="center">
  <strong>One intelligent workspace for AI conversations, file conversion, and chat management.</strong>
</p>

<p align="center">
  <a href="https://synapse-blush-tau.vercel.app/">
    <img src="https://img.shields.io/badge/Live%20Demo-Synapse-black?style=for-the-badge&logo=vercel" alt="Live Demo">
  </a>
  <img src="https://img.shields.io/badge/AI-Powered-blue?style=for-the-badge" alt="AI Powered">
  <img src="https://img.shields.io/badge/Status-Active-success?style=for-the-badge" alt="Status">
</p>

---

## 🌐 Live Demo

**Try Synapse:**  
https://synapse-blush-tau.vercel.app/

---

## 📌 Overview

**Synapse** is an AI-powered digital workspace designed to bring useful productivity and developer-oriented tools together in a single interface.

Instead of switching between multiple applications for conversations, file conversion, and chat management, Synapse provides these capabilities through one unified workspace.

The platform provides an AI chat experience along with tools for converting files, searching previous conversations, and combining multiple chats into a single conversation.

---

## 🎯 Problem Statement

Modern developers and students often use multiple tools for:

- AI-assisted conversations
- Managing previous chats
- Searching conversation history
- Converting files between formats
- Organizing information from multiple conversations

Switching between different platforms can make these workflows fragmented and inefficient.

### Our Solution

Synapse brings these capabilities together into a centralized AI workspace where users can interact with AI, manage conversations, and perform useful file operations from one place.

---

## ✨ Key Features

### 🤖 AI Chat

Interact with an AI assistant through a simple conversational interface.

- Ask questions using natural language
- Get AI-assisted responses
- Continue conversations within the workspace
- Designed for productivity and developer workflows

### 🔐 Multiple Sign-In Options

Synapse provides multiple authentication options, including:

- Google sign-in
- Email-based sign-in
- Mobile-number sign-in

This provides users with flexible ways to access the platform.

### 📁 File Converter

Convert files through an easy drag-and-drop interface.

**Features include:**

- Drag-and-drop file upload
- File picker
- Folder selection
- Target-format selection
- File conversion workflow

### 🔄 Mix Chats

Combine multiple conversations into a single chat.

Users can:

1. Select multiple conversations
2. Choose a new chat title
3. Merge the selected chats
4. Continue working with the combined context

This is useful when information is distributed across different conversations.

### 🔎 Search Chats

Search through previous conversations using:

- Chat titles
- Message content

This makes it easier to retrieve previously discussed information.

### ☁️ Cloud Deployment

Synapse is deployed using **Vercel**, making the application accessible through a public web URL.

---

## 🧠 IBM Bob Integration / Development

This project was developed with the assistance of **IBM Bob**, IBM's AI-powered software development partner.

IBM Bob supports software-development workflows such as understanding codebases, generating and modifying code, debugging, documentation, testing, and other software-development tasks. :contentReference[oaicite:2]{index=2}

In this project, IBM Bob was used as an AI development companion to support the development workflow and accelerate implementation.

> IBM Bob was used as a development assistant; the final application, design decisions, implementation, and validation remain part of the project team's work.

---

## 🏗️ Application Workflow

```text
                    ┌─────────────────────┐
                    │       Synapse       │
                    │   AI Workspace      │
                    └──────────┬──────────┘
                               │
          ┌────────────────────┼────────────────────┐
          │                    │                    │
          ▼                    ▼                    ▼
    ┌───────────┐       ┌─────────────┐      ┌────────────┐
    │ AI Chat   │       │ File        │      │ Chat       │
    │           │       │ Converter   │      │ Management │
    └─────┬─────┘       └──────┬──────┘      └─────┬──────┘
          │                    │                    │
          │                    │             ┌──────┴──────┐
          │                    │             │             │
          │                    │             ▼             ▼
          │                    │        Mix Chats     Search Chats
          │                    │
          └────────────────────┴────────────────────────────┐
                                                             │
                                                             ▼
                                                   User Productivity
