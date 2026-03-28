/**
 * English translations for the Kanban app
 * Values can be:
 * - String constants for static text
 * - Functions with typed object parameters for dynamic text
 */

/**
 * English plural helper function
 * @param options - Object containing count, singular, and plural forms
 * @returns The appropriate form based on count
 */
function plural({ count, singular, plural }: { count: number; singular: string; plural: string }): string {
    return count === 1 ? singular : plural;
}

export const en = {
    tabs: {
        // Tab navigation labels
        sessions: 'Terminals',
        settings: 'Settings',
    },

    common: {
        // Simple string constants
        cancel: 'Cancel',
        authenticate: 'Authenticate',
        save: 'Save',
        error: 'Error',
        success: 'Success',
        ok: 'OK',
        continue: 'Continue',
        back: 'Back',
        create: 'Create',
        rename: 'Rename',
        reset: 'Reset',
        logout: 'Logout',
        disconnect: 'Disconnect',
        yes: 'Yes',
        no: 'No',
        discard: 'Discard',
        version: 'Version',
        copied: 'Copied',
        scanning: 'Scanning...',
        urlPlaceholder: 'https://example.com',
        home: 'Home',
        message: 'Message',
        files: 'Files',
        fileViewer: 'File Viewer',
        loading: 'Loading...',
        retry: 'Retry',
        feedback: 'Feedback',
    },

    profile: {
        userProfile: 'User Profile',
        details: 'Details',
        firstName: 'First Name',
        lastName: 'Last Name',
        username: 'Username',
        status: 'Status',
    },

    status: {
        connected: 'connected',
        connecting: 'connecting',
        disconnected: 'disconnected',
        error: 'error',
        online: 'online',
        offline: 'offline',
        ended: 'ended',
        lastSeen: ({ time }: { time: string }) => `last seen ${time}`,
        permissionRequired: 'permission required',
        activeNow: 'Active now',
        unknown: 'unknown',
    },

    time: {
        justNow: 'just now',
        minutesAgo: ({ count }: { count: number }) => `${count} minute${count !== 1 ? 's' : ''} ago`,
        hoursAgo: ({ count }: { count: number }) => `${count} hour${count !== 1 ? 's' : ''} ago`,
    },

    connect: {
        restoreAccount: 'Restore Account',
        enterSecretKey: 'Please enter a secret key',
        invalidSecretKey: 'Invalid secret key. Please check and try again.',
        enterUrlManually: 'Enter URL manually',
        enterUrlDescription: 'Paste a secure link from another device when a camera is unavailable.',
        myKey: 'My Secret Key',
        myKeyDescription: 'Restoring this key on any device connects all machines bound to it — they will all be active and able to communicate.',
        restoreDescription: 'Enter your secret key to restore this device. All machines previously linked to this key will reconnect automatically.',
        restoreKeyHint: 'Paste the backup key from your password manager or another trusted device.',
        linkViaQRCode: 'Link via QR Code',
        linkViaQRCodeDescription: 'Scan from an authorized device to link this machine.',
        linkViaQRCodeInstructions: 'Open Aha on an authorized device, go to Settings → Account → Link New Device, and scan this QR code.',
    },

    settings: {
        title: 'Settings',
        connectedAccounts: 'Connected Accounts',
        connectAccount: 'Connect account',
        github: 'GitHub',
        machines: 'Machines',
        features: 'Features',
        social: 'Social',
        account: 'Account',
        accountSubtitle: 'Manage your account details',
        syncDeviceTitle: 'Link New Device',
        syncDeviceSubtitle: 'Open secure link and recovery options for this device',
        appearance: 'Appearance',
        appearanceSubtitle: 'Customize how the app looks',
        voiceAssistant: 'Voice Assistant',
        voiceAssistantSubtitle: 'Configure voice interaction preferences',
        channels: 'Channels',
        channelsWeixin: 'WeChat',
        channelsWeixinSubtitle: 'Push Agent messages to WeChat',
        featuresTitle: 'Features',
        featuresSubtitle: 'Enable or disable app features',
        developer: 'Developer',
        developerTools: 'Developer Tools',
        about: 'About',
        aboutFooter: 'Aha is a Codex and Claude Code AI workbench. It\'s fully end-to-end encrypted and your account is stored only on your device. Not affiliated with Anthropic.',
        whatsNew: 'What\'s New',
        whatsNewSubtitle: 'See the latest updates and improvements',
        reportIssue: 'Report an Issue',
        privacyPolicy: 'Privacy Policy',
        termsOfService: 'Terms of Service',
        eula: 'EULA',
        supportUs: 'Support us',
        supportUsSubtitlePro: 'Thank you for your support!',
        supportUsSubtitle: 'Support project development',
        scanQrCodeToAuthenticate: 'Scan QR code to authenticate',
        githubConnected: ({ login }: { login: string }) => `Connected as @${login}`,
        connectGithubAccount: 'Connect your GitHub account',
        claudeAuthSuccess: 'Successfully connected to Claude',
        exchangingTokens: 'Exchanging tokens...',
        usage: 'Usage',
        usageSubtitle: 'View your API usage and costs',

        // Dynamic settings messages
        accountConnected: ({ service }: { service: string }) => `${service} account connected`,
        machineStatus: ({ name, status }: { name: string; status: 'online' | 'offline' }) =>
            `${name} is ${status}`,
        featureToggled: ({ feature, enabled }: { feature: string; enabled: boolean }) =>
            `${feature} ${enabled ? 'enabled' : 'disabled'}`,
    },

    settingsAppearance: {
        // Appearance settings screen
        theme: 'Theme',
        themeDescription: 'Choose your preferred color scheme',
        themeOptions: {
            adaptive: 'Adaptive',
            light: 'Light',
            dark: 'Dark',
        },
        themeDescriptions: {
            adaptive: 'Match system settings',
            light: 'Always use light theme',
            dark: 'Always use dark theme',
        },
        display: 'Display',
        displayDescription: 'Control layout and spacing',
        inlineToolCalls: 'Inline Tool Calls',
        inlineToolCallsDescription: 'Display tool calls directly in chat messages',
        expandTodoLists: 'Expand Todo Lists',
        expandTodoListsDescription: 'Show all todos instead of just changes',
        showLineNumbersInDiffs: 'Show Line Numbers in Diffs',
        showLineNumbersInDiffsDescription: 'Display line numbers in code diffs',
        showLineNumbersInToolViews: 'Show Line Numbers in Tool Views',
        showLineNumbersInToolViewsDescription: 'Display line numbers in tool view diffs',
        wrapLinesInDiffs: 'Wrap Lines in Diffs',
        wrapLinesInDiffsDescription: 'Wrap long lines instead of horizontal scrolling in diff views',
        alwaysShowContextSize: 'Always Show Context Size',
        alwaysShowContextSizeDescription: 'Display context usage even when not near limit',
        avatarStyle: 'Avatar Style',
        avatarStyleDescription: 'Choose session avatar appearance',
        avatarOptions: {
            pixelated: 'Pixelated',
            gradient: 'Gradient',
            brutalist: 'Brutalist',
        },
        showFlavorIcons: 'Show AI Provider Icons',
        showFlavorIconsDescription: 'Display AI provider icons on session avatars',
        compactSessionView: 'Compact Session View',
        compactSessionViewDescription: 'Show active sessions in a more compact layout',
    },

    channels: {
        connectionStatus: 'Connection Status',
        connected: 'Connected',
        connectWeixin: 'Connect WeChat',
        connectWeixinSubtitle: 'Run in terminal to scan QR code',
        checkStatus: 'Check Status',
        disconnectConfirm: 'Disconnect WeChat? You will stop receiving Agent messages.',
        cliFooter: 'Tap any item to copy the command, then run it in your terminal.',
        pushPolicyTitle: 'Push Policy',
        pushPolicyFooter: 'Controls which Agent messages are forwarded to WeChat.',
        policyAll: 'All Messages',
        policyImportant: 'Important Only',
        policySilent: 'Silent',
        weixinConnected: 'WeChat connected successfully.',
        weixinDisconnected: 'WeChat disconnected.',
        weixinQrExpired: 'QR code expired. Generate a new one and scan again.',
        weixinBindHint: 'Bind your WeChat bot to receive agent messages and reply from WeChat.',
        weixinPushPolicyCurrent: ({ policy }: { policy: string }) => `Push policy: ${policy}`,
        weixinScanWaiting: 'Waiting for scan confirmation...',
        weixinQrHint: 'Scan this QR code in WeChat iLink Bot. The page will bind automatically after confirmation.',
        weixinCopyQrLink: 'Copy QR link',
        usageGuide: 'Usage Guide',
        guide1: 'Reply directly → sends to master',
        guide2: '@roleName to address a specific Agent',
        guide3: '#teamName to target a specific Team',
    },

    channelsList: {
        title: 'Channels',
        connectedTitle: 'Connected Channels',
        connectedFooter: 'Channels actively bridging Agent messages.',
        availableTitle: 'Available Channels',
    },

    addAgent: {
        title: 'Add Agent to Team',
        searchPlaceholder: 'Search agents...',
        sortedByRank: 'Sorted by Score (Rank)',
        noResults: 'No agents found. Try a different search.',
        spawn: 'Add to Team',
    },

    settingsFeatures: {
        experiments: 'Experiments',
        experimentsDescription: 'Enable experimental features that are still in development. These features may be unstable or change without notice.',
        experimentalFeatures: 'Experimental Features',
        experimentalFeaturesEnabled: 'Experimental features enabled',
        experimentalFeaturesDisabled: 'Using stable features only',
        webFeatures: 'Web Features',
        webFeaturesDescription: 'Features available only in the web version of the app.',
        commandPalette: 'Command Palette',
        commandPaletteEnabled: 'Press ⌘K to open',
        commandPaletteDisabled: 'Quick command access disabled',
        markdownCopyV2: 'Markdown Copy v2',
        markdownCopyV2Subtitle: 'Long press opens copy modal',
        hideInactiveSessions: 'Hide inactive sessions',
        hideInactiveSessionsSubtitle: 'Show only active chats in your list',
    },

    errors: {
        networkError: 'Network error occurred',
        serverError: 'Server error occurred',
        unknownError: 'An unknown error occurred',
        connectionTimeout: 'Connection timed out',
        authenticationFailed: 'Authentication failed',
        permissionDenied: 'Permission denied',
        fileNotFound: 'File not found',
        invalidFormat: 'Invalid format',
        operationFailed: 'Operation failed',
        tryAgain: 'Please try again',
        contactSupport: 'Contact support if the problem persists',
        sessionNotFound: 'Session not found',
        voiceSessionFailed: 'Failed to start voice session',
        oauthInitializationFailed: 'Failed to initialize OAuth flow',
        tokenStorageFailed: 'Failed to store authentication tokens',
        oauthStateMismatch: 'Security validation failed. Please try again',
        tokenExchangeFailed: 'Failed to exchange authorization code',
        oauthAuthorizationDenied: 'Authorization was denied',
        webViewLoadFailed: 'Failed to load authentication page',
        failedToLoadProfile: 'Failed to load user profile',
        userNotFound: 'User not found',
        sessionDeleted: 'Session has been deleted',
        sessionDeletedDescription: 'This session has been permanently removed',

        // Error functions with context
        fieldError: ({ field, reason }: { field: string; reason: string }) =>
            `${field}: ${reason}`,
        validationError: ({ field, min, max }: { field: string; min: number; max: number }) =>
            `${field} must be between ${min} and ${max}`,
        retryIn: ({ seconds }: { seconds: number }) =>
            `Retry in ${seconds} ${seconds === 1 ? 'second' : 'seconds'}`,
        errorWithCode: ({ message, code }: { message: string; code: number | string }) =>
            `${message} (Error ${code})`,
        disconnectServiceFailed: ({ service }: { service: string }) =>
            `Failed to disconnect ${service}`,
        connectServiceFailed: ({ service }: { service: string }) =>
            `Failed to connect ${service}. Please try again.`,
        failedToLoadFriends: 'Failed to load friends list',
        failedToAcceptRequest: 'Failed to accept friend request',
        failedToRejectRequest: 'Failed to reject friend request',
        failedToRemoveFriend: 'Failed to remove friend',
        searchFailed: 'Search failed. Please try again.',
        failedToSendRequest: 'Failed to send friend request',
    },

    newSession: {
        // Used by new-session screen and launch flows
        title: 'Start New Session',
        noMachinesFound: 'No machines found. Start a Kanban session on your computer first.',
        allMachinesOffline: 'All machines appear offline',
        machineDetails: 'View machine details →',
        directoryDoesNotExist: 'Directory Not Found',
        createDirectoryConfirm: ({ directory }: { directory: string }) => `The directory ${directory} does not exist. Do you want to create it?`,
        sessionStarted: 'Session Started',
        sessionStartedMessage: 'The session has been started successfully.',
        sessionSpawningFailed: 'Session spawning failed - no session ID returned.',
        startingSession: 'Starting session...',
        startNewSessionInFolder: 'New session here',
        failedToStart: 'Failed to start session. Make sure the daemon is running on the target machine.',
        sessionTimeout: 'Session startup timed out. The machine may be slow or the daemon may not be responding.',
        notConnectedToServer: 'Not connected to server. Check your internet connection.',
        noMachineSelected: 'Please select a machine to start the session',
        noPathSelected: 'Please select a directory to start the session in',
        sessionType: {
            title: 'Session Type',
            simple: 'Simple',
            worktree: 'Worktree',
            comingSoon: 'Coming soon',
        },
        worktree: {
            creating: ({ name }: { name: string }) => `Creating worktree '${name}'...`,
            notGitRepo: 'Worktrees require a git repository',
            failed: ({ error }: { error: string }) => `Failed to create worktree: ${error}`,
            success: 'Worktree created successfully',
        }
    },

    sessionHistory: {
        // Used by session history screen
        title: 'Session History',
        empty: 'No sessions found',
        today: 'Today',
        yesterday: 'Yesterday',
        daysAgo: ({ count }: { count: number }) => `${count} ${count === 1 ? 'day' : 'days'} ago`,
        viewAll: 'View all sessions',
        totalTokensLabel: ({ tokens }: { tokens: string }) => `${tokens} used across all sessions`,
        viewUsageStats: '→ View usage stats',
    },

    session: {
        inputPlaceholder: 'Type a message ...',
    },

    commandPalette: {
        placeholder: 'Type a command or search...',
    },

    server: {
        // Used by Server Configuration screen (app/(app)/server.tsx)
        serverConfiguration: 'Server Configuration',
        enterServerUrl: 'Please enter a server URL',
        notValidHappyServer: 'Not a valid Kanban Server',
        changeServer: 'Change Server',
        continueWithServer: 'Continue with this server?',
        resetToDefault: 'Reset to Default',
        resetServerDefault: 'Reset server to default?',
        validating: 'Validating...',
        validatingServer: 'Validating server...',
        serverReturnedError: 'Server returned an error',
        failedToConnectToServer: 'Failed to connect to server',
        currentlyUsingCustomServer: 'Currently using custom server',
        customServerUrlLabel: 'Custom Server URL',
        advancedFeatureFooter: "This is an advanced feature. Only change the server if you know what you're doing. You will need to log out and log in again after changing servers."
    },

    sessionInfo: {
        // Used by Session Info screen (app/(app)/session/[id]/info.tsx)
        killSession: 'Kill Session',
        killSessionConfirm: 'Are you sure you want to terminate this session?',
        archiveSession: 'Archive Session',
        archiveSessionConfirm: 'Are you sure you want to archive this session?',
        happySessionIdCopied: 'Kanban Session ID copied to clipboard',
        failedToCopySessionId: 'Failed to copy Kanban Session ID',
        happySessionId: 'Kanban Session ID',
        claudeCodeSessionId: 'Claude Code Session ID',
        claudeCodeSessionIdCopied: 'Claude Code Session ID copied to clipboard',
        aiProvider: 'AI Provider',
        failedToCopyClaudeCodeSessionId: 'Failed to copy Claude Code Session ID',
        metadataCopied: 'Metadata copied to clipboard',
        failedToCopyMetadata: 'Failed to copy metadata',
        failedToKillSession: 'Failed to kill session',
        failedToArchiveSession: 'Failed to archive session',
        connectionStatus: 'Connection Status',
        created: 'Created',
        lastUpdated: 'Last Updated',
        sequence: 'Sequence',
        quickActions: 'Quick Actions',
        viewMachine: 'View Machine',
        viewMachineSubtitle: 'View machine details and sessions',
        killSessionSubtitle: 'Immediately terminate the session',
        archiveSessionSubtitle: 'Archive this session and stop it',
        metadata: 'Metadata',
        host: 'Host',
        path: 'Path',
        operatingSystem: 'Operating System',
        processId: 'Process ID',
        happyHome: 'Kanban Home',
        copyMetadata: 'Copy Metadata',
        agentState: 'Agent State',
        controlledByUser: 'Controlled by User',
        pendingRequests: 'Pending Requests',
        activity: 'Activity',
        thinking: 'Thinking',
        thinkingSince: 'Thinking Since',
        cliVersion: 'CLI Version',
        cliVersionOutdated: 'CLI Update Required',
        cliVersionOutdatedMessage: ({ currentVersion, requiredVersion }: { currentVersion: string; requiredVersion: string }) =>
            `Version ${currentVersion} installed. Update to ${requiredVersion} or later`,
        updateCliInstructions: 'Please run npm install -g kanban-coder@latest',
        deleteSession: 'Delete Session',
        deleteSessionSubtitle: 'Permanently remove this session',
        deleteSessionConfirm: 'Delete Session Permanently?',
        deleteSessionWarning: 'This action cannot be undone. All messages and data associated with this session will be permanently deleted.',
        failedToDeleteSession: 'Failed to delete session',
        sessionDeleted: 'Session deleted successfully',
        usageSection: 'Token Usage',
        inputTokens: 'Input Tokens',
        outputTokens: 'Output Tokens',
        cacheRead: 'Cache Read',
        cacheCreation: 'Cache Created',
        contextSize: 'Context Size',
        estimatedCost: 'Estimated Cost',
        noUsageData: 'No usage data yet',
        tokensUnit: ({ n }: { n: number }) => `${n.toLocaleString()} tok`,
        costUnit: ({ usd }: { usd: number }) => `$${usd.toFixed(4)}`,

    },

    home: {
        welcome: 'Welcome to Aha',
        welcomeSubtitle: 'Your AI-powered workspace',
        gettingStarted: 'Getting Started',
        docsTitle: 'Getting Started Guide',
        docsSubtitle: 'Learn how to use Aha and connect your AI agents',
        teamSection: 'Team',
        createTeamTitle: 'Create a Team',
        createTeamSubtitle: 'Collaborate with your team in real-time',
        helpSection: 'Help',
        helpTitle: 'How Aha agents work',
        helpSubtitle: 'A compact guide to cross-device, remote, clustered execution.',
        helpExpand: 'Show FAQ',
        helpCollapse: 'Hide FAQ',
        helpKeywordCrossDevice: 'Cross-device',
        helpKeywordRemote: 'Remote',
        helpKeywordCluster: 'Cluster',
        helpKeywordEvolution: 'Evolution',
        helpQuestionWhat: 'What is this system good at?',
        helpAnswerWhat: 'Aha coordinates Claude Code and Codex agents across devices so one team can plan, build, review, and iterate in parallel.',
        helpQuestionStart: 'How do I use it for a real task?',
        helpAnswerStart: 'Start with a team, choose a machine and working directory, then give a concrete task. The manager agents break work apart and route it to specialists.',
        helpQuestionDevices: 'How does linking devices help?',
        helpAnswerDevices: 'Linking lets your account and machines move with you, so a phone, tablet, browser, or desktop can all approve, monitor, and continue the same work.',
        helpQuestionCluster: 'What do remote, cluster, and evolution mean here?',
        helpAnswerCluster: 'Remote means agents can run away from your current screen, cluster means multiple machines cooperate, and evolution means the team can be reshaped as the task changes.',
        devicesSection: 'Devices',
        syncDeviceTitle: 'Link New Device',
        syncDeviceSubtitle: 'Open secure link and recovery options for this device',
        workSection: 'Work',
        reportTitle: 'Team Overview',
        reportSubtitle: 'View your team activity and progress',
        completedTasks: 'Completed Tasks',
        exploreSection: 'Explore',
        marketplaceTitle: 'Agent Marketplace',
        marketplaceSubtitle: 'Discover and install AI agents',
    },

    newTeam: {
        quickStartLabel: 'Quick Start',
        pageTitle: 'Create Team',
        pageEyebrow: 'Teams',
        pageSubtitle: 'Assemble a new team — describe your goal and AI will auto-build the right agents, or compose manually.',
        createButton: 'Create team',
        teamNameLabel: 'Team Name',
        teamNamePlaceholder: 'e.g. Backend Team',
        creationModeLabel: 'Creation Mode',
        modePrompt: 'Prompt',
        modeManual: 'Manual',
        taskPromptLabel: 'Task Prompt',
        taskPromptPlaceholder: 'Describe your task, AI will auto-assemble the team...',
        teamGoalLabel: 'Team Goal',
        agentTypeLabel: 'Type',
        agentTypeHelperText: 'Passed to org-manager as a preference only: pure Claude Code, pure Codex, or mixed.',
        machinesLabel: 'Machines',
        noMachinesHelperText: 'Start the Aha CLI on your computer to make machines available.',
        setPrimaryButton: 'Set primary',
        removeButton: 'Remove',
        workingDirectoryLabel: 'Working Directory',
        useLastPathButton: 'Use last path',
        homeDirectoryLabel: 'Home Directory',
        hideRecentPaths: 'Hide recent paths',
        chooseFromRecentPaths: 'Choose from recent paths',
        automationSettingsLabel: 'Automation Settings',
        machineLabel: 'Machine',
        agentTypeSectionLabel: 'Agent Type',
        noMachinesSpawnHelperText: 'Start the Aha CLI on your computer to spawn teammates automatically.',
        templates: {
            content: { title: 'Content Studio', subtitle: 'Write, SEO, social' },
            research: { title: 'Research Team', subtitle: 'Multi-source analysis' },
            legal: { title: 'Contract Review', subtitle: 'Parallel doc analysis' },
            intelligence: { title: 'Market Intel', subtitle: 'Competitor tracking' },
        },
    },

    components: {
        emptyMainScreen: {
            // Used by EmptyMainScreen component
            readyToCode: 'Ready to code?',
            installCli: 'Install the Kanban CLI',
            runIt: 'Run it',
            scanQrCode: 'Scan the QR code',
            openCamera: 'Open Camera',
        },
    },

    agentInput: {
        permissionMode: {
            title: 'PERMISSION MODE',
            default: 'Default',
            acceptEdits: 'Accept Edits',
            plan: 'Plan Mode',
            bypassPermissions: 'Yolo Mode',
            badgeAcceptAllEdits: 'Accept All Edits',
            badgeBypassAllPermissions: 'Full Auto Mode',
            badgePlanMode: 'Plan Mode',
        },
        agent: {
            claude: 'Claude',
            codex: 'Codex',
        },
        model: {
            title: 'MODEL',
            default: 'Use CLI settings',
            adaptiveUsage: 'Opus up to 50% usage, then Sonnet',
            sonnet: 'Sonnet',
            opus: 'Opus',
        },
        codexPermissionMode: {
            title: 'CODEX PERMISSION MODE',
            default: 'CLI Settings',
            readOnly: 'Read Only Mode',
            safeYolo: 'Safe YOLO',
            yolo: 'YOLO',
            badgeReadOnly: 'Read Only Mode',
            badgeSafeYolo: 'Safe YOLO',
            badgeYolo: 'YOLO',
        },
        codexModel: {
            title: 'CODEX MODEL',
            gpt5CodexLow: 'gpt-5-codex low',
            gpt5CodexMedium: 'gpt-5-codex medium',
            gpt5CodexHigh: 'gpt-5-codex high',
            gpt5Minimal: 'GPT-5 Minimal',
            gpt5Low: 'GPT-5 Low',
            gpt5Medium: 'GPT-5 Medium',
            gpt5High: 'GPT-5 High',
        },
        context: {
            remaining: ({ percent }: { percent: number }) => `${percent}% left`,
        },
        suggestion: {
            fileLabel: 'FILE',
            folderLabel: 'FOLDER',
        },
        noMachinesAvailable: 'No machines',
    },

    machineLauncher: {
        showLess: 'Show less',
        showAll: ({ count }: { count: number }) => `Show all (${count} paths)`,
        enterCustomPath: 'Enter custom path',
        offlineUnableToSpawn: 'Unable to spawn new session, offline',
    },

    sidebar: {
        sessionsTitle: 'Aha',
        workspace: 'Workspace',
        online: 'Online',
        needsDecision: 'Needs Decision',
        working: 'Working',
        teamReview: 'Team Review',
        noTeamsYet: 'No teams yet',
        openTeamWorkspace: 'Open team workspace',
        agents: 'Agents',
        conversations: 'Conversations',
        noActiveAgents: 'No active agents',
        noConversationsYet: 'No conversations yet',
    },

    toolView: {
        input: 'Input',
        output: 'Output',
    },

    tools: {
        fullView: {
            description: 'Description',
            inputParams: 'Input Parameters',
            output: 'Output',
            error: 'Error',
            completed: 'Tool completed successfully',
            noOutput: 'No output was produced',
            running: 'Tool is running...',
            rawJsonDevMode: 'Raw JSON (Dev Mode)',
        },
        taskView: {
            initializing: 'Initializing agent...',
            moreTools: ({ count }: { count: number }) => `+${count} more ${plural({ count, singular: 'tool', plural: 'tools' })}`,
        },
        multiEdit: {
            editNumber: ({ index, total }: { index: number; total: number }) => `Edit ${index} of ${total}`,
            replaceAll: 'Replace All',
        },
        names: {
            task: 'Task',
            terminal: 'Terminal',
            searchFiles: 'Search Files',
            search: 'Search',
            searchContent: 'Search Content',
            listFiles: 'List Files',
            planProposal: 'Plan proposal',
            readFile: 'Read File',
            editFile: 'Edit File',
            writeFile: 'Write File',
            fetchUrl: 'Fetch URL',
            readNotebook: 'Read Notebook',
            editNotebook: 'Edit Notebook',
            todoList: 'Todo List',
            webSearch: 'Web Search',
            reasoning: 'Reasoning',
            applyChanges: 'Update file',
            viewDiff: 'Current file changes',
        },
        desc: {
            terminalCmd: ({ cmd }: { cmd: string }) => `Terminal(cmd: ${cmd})`,
            searchPattern: ({ pattern }: { pattern: string }) => `Search(pattern: ${pattern})`,
            searchPath: ({ basename }: { basename: string }) => `Search(path: ${basename})`,
            fetchUrlHost: ({ host }: { host: string }) => `Fetch URL(url: ${host})`,
            editNotebookMode: ({ path, mode }: { path: string; mode: string }) => `Edit Notebook(file: ${path}, mode: ${mode})`,
            todoListCount: ({ count }: { count: number }) => `Todo List(count: ${count})`,
            webSearchQuery: ({ query }: { query: string }) => `Web Search(query: ${query})`,
            grepPattern: ({ pattern }: { pattern: string }) => `grep(pattern: ${pattern})`,
            multiEditEdits: ({ path, count }: { path: string; count: number }) => `${path} (${count} edits)`,
            readingFile: ({ file }: { file: string }) => `Reading ${file}`,
            writingFile: ({ file }: { file: string }) => `Writing ${file}`,
            modifyingFile: ({ file }: { file: string }) => `Modifying ${file}`,
            modifyingFiles: ({ count }: { count: number }) => `Modifying ${count} files`,
            modifyingMultipleFiles: ({ file, count }: { file: string; count: number }) => `${file} and ${count} more`,
            showingDiff: 'Showing changes',
        }
    },

    files: {
        searchPlaceholder: 'Search files...',
        detachedHead: 'detached HEAD',
        summary: ({ staged, unstaged }: { staged: number; unstaged: number }) => `${staged} staged • ${unstaged} unstaged`,
        notRepo: 'Not a git repository',
        notUnderGit: 'This directory is not under git version control',
        searching: 'Searching files...',
        noFilesFound: 'No files found',
        noFilesInProject: 'No files in project',
        tryDifferentTerm: 'Try a different search term',
        searchResults: ({ count }: { count: number }) => `Search Results (${count})`,
        projectRoot: 'Project root',
        stagedChanges: ({ count }: { count: number }) => `Staged Changes (${count})`,
        unstagedChanges: ({ count }: { count: number }) => `Unstaged Changes (${count})`,
        // File viewer strings
        loadingFile: ({ fileName }: { fileName: string }) => `Loading ${fileName}...`,
        binaryFile: 'Binary File',
        cannotDisplayBinary: 'Cannot display binary file content',
        diff: 'Diff',
        file: 'File',
        fileEmpty: 'File is empty',
        noChanges: 'No changes to display',
    },

    settingsVoice: {
        // Voice settings screen
        languageTitle: 'Language',
        languageDescription: 'Choose your preferred language for voice assistant interactions. This setting syncs across all your devices.',
        preferredLanguage: 'Preferred Language',
        preferredLanguageSubtitle: 'Language used for voice assistant responses',
        language: {
            searchPlaceholder: 'Search languages...',
            title: 'Languages',
            footer: ({ count }: { count: number }) => `${count} ${plural({ count, singular: 'language', plural: 'languages' })} available`,
            autoDetect: 'Auto-detect',
        }
    },

    settingsAccount: {
        // Account settings screen
        accountInformation: 'Account Information',
        status: 'Status',
        statusActive: 'Active',
        statusNotAuthenticated: 'Not Authenticated',
        anonymousId: 'Anonymous ID',
        publicId: 'Public ID',
        notAvailable: 'Not available',
        linkNewDevice: 'Link New Device',
        linkNewDeviceSubtitle: 'Open secure link and recovery options for this device',
        profile: 'Profile',
        name: 'Name',
        github: 'GitHub',
        tapToDisconnect: 'Tap to disconnect',
        server: 'Server',
        backup: 'Backup',
        backupDescription: 'Your secret key is the only way to recover your account. Save it in a secure place like a password manager.',
        secretKey: 'Secret Key',
        tapToReveal: 'Tap to reveal',
        tapToHide: 'Tap to hide',
        secretKeyLabel: 'SECRET KEY (TAP TO COPY)',
        secretKeyCopied: 'Secret key copied to clipboard. Store it in a safe place!',
        secretKeyCopyFailed: 'Failed to copy secret key',
        restoreCommandLabel: 'RESTORE COMMAND (TAP TO COPY)',
        restoreCommandCopied: 'Command copied! Paste and run on the new machine.',
        restoreCommandCopyFailed: 'Failed to copy restore command',
        privacy: 'Privacy',
        privacyDescription: 'Optional anonymous product analytics help improve the app. Purchase operations are logged separately on the backend for billing reliability and debugging.',
        analytics: 'Anonymous product analytics',
        analyticsDisabled: 'Optional analytics are off',
        analyticsEnabled: 'Optional anonymous analytics are on',
        operationalLogs: 'Operational purchase logs',
        operationalLogsDescription: 'Always on for billing/debugging reliability. No message content, prompts, or code are included.',
        dangerZone: 'Danger Zone',
        logout: 'Logout',
        logoutSubtitle: 'Sign out and clear local data',
        logoutConfirm: 'Are you sure you want to logout? Make sure you have backed up your secret key!',
    },

    settingsLanguage: {
        // Language settings screen
        title: 'Language',
        description: 'Choose your preferred language for the app interface. This will sync across all your devices.',
        currentLanguage: 'Current Language',
        automatic: 'Automatic',
        automaticSubtitle: 'Detect from IP region, then fall back to device locale',
        needsRestart: 'Language Changed',
        needsRestartMessage: 'The app needs to restart to apply the new language setting.',
        restartNow: 'Restart Now',
    },

    connectButton: {
        authenticate: 'Authenticate Terminal',
        authenticateWithUrlPaste: 'Authenticate Terminal with URL paste',
        pasteAuthUrl: 'Paste the auth URL from your terminal',
    },

    updateBanner: {
        updateAvailable: 'Update available',
        pressToApply: 'Press to apply the update',
        whatsNew: "What's new",
        seeLatest: 'See the latest updates and improvements',
        nativeUpdateAvailable: 'App Update Available',
        tapToUpdateAppStore: 'Tap to update in App Store',
        tapToUpdatePlayStore: 'Tap to update in Play Store',
    },

    changelog: {
        // Used by the changelog screen
        version: ({ version }: { version: number }) => `Version ${version}`,
        noEntriesAvailable: 'No changelog entries available.',
    },

    terminal: {
        // Used by terminal connection screens
        webBrowserRequired: 'Web Browser Required',
        webBrowserRequiredDescription: 'Terminal connection links can only be opened in a web browser for security reasons. Please use the QR code scanner or open this link on a computer.',
        processingConnection: 'Processing connection...',
        invalidConnectionLink: 'Invalid Connection Link',
        invalidConnectionLinkDescription: 'The connection link is missing or invalid. Please check the URL and try again.',
        connectTerminal: 'Connect Terminal',
        terminalRequestDescription: 'A terminal is requesting to connect to your Kanban Coder account. This will allow the terminal to send and receive messages securely.',
        connectionDetails: 'Connection Details',
        publicKey: 'Public Key',
        encryption: 'Encryption',
        endToEndEncrypted: 'End-to-end encrypted',
        acceptConnection: 'Accept Connection',
        connecting: 'Connecting...',
        reject: 'Reject',
        security: 'Security',
        securityFooter: 'This connection link was processed securely in your browser and was never sent to any server. Your private data will remain secure and only you can decrypt the messages.',
        securityFooterDevice: 'This connection was processed securely on your device and was never sent to any server. Your private data will remain secure and only you can decrypt the messages.',
        clientSideProcessing: 'Client-Side Processing',
        linkProcessedLocally: 'Link processed locally in browser',
        linkProcessedOnDevice: 'Link processed locally on device',
    },

    modals: {
        // Used across connect flows and settings
        authenticateTerminal: 'Authenticate Terminal',
        pasteUrlFromTerminal: 'Paste the authentication URL from your terminal',
        deviceLinkedSuccessfully: 'Device linked successfully',
        terminalConnectedSuccessfully: 'Terminal connected successfully',
        invalidAuthUrl: 'Invalid authentication URL',
        developerMode: 'Developer Mode',
        developerModeEnabled: 'Developer mode enabled',
        developerModeDisabled: 'Developer mode disabled',
        disconnectGithub: 'Disconnect GitHub',
        disconnectGithubConfirm: 'Are you sure you want to disconnect your GitHub account?',
        disconnectService: ({ service }: { service: string }) =>
            `Disconnect ${service}`,
        disconnectServiceConfirm: ({ service }: { service: string }) =>
            `Are you sure you want to disconnect ${service} from your account?`,
        disconnect: 'Disconnect',
        failedToConnectTerminal: 'Failed to connect terminal',
        cameraPermissionsRequiredToConnectTerminal: 'Camera permissions are required to connect terminal',
        failedToLinkDevice: 'Failed to link device',
        cameraPermissionsRequiredToScanQr: 'Camera permissions are required to scan QR codes'
    },

    navigation: {
        // Navigation titles and screen headers
        connectTerminal: 'Connect Terminal',
        linkNewDevice: 'Link New Device',
        restoreWithSecretKey: 'Restore with Secret Key',
        whatsNew: "What's New",
    },

    welcome: {
        // Main welcome screen for unauthenticated users
        title: 'Hire your AI agent\nlegion. One command.',
        subtitle: 'Let Claude Code and Codex form teams across any machine — servers, GPUs, Macs, Windows. They evolve. They ship.',
        createAccount: 'Create account',
        linkOrRestoreAccount: 'Link or restore account',
        loginWithMobileApp: 'npx aha teams spawn saas-mvp',
    },

    review: {
        // Used by utils/requestReview.ts
        enjoyingApp: 'Enjoying the app?',
        feedbackPrompt: "We'd love to hear your feedback!",
        yesILoveIt: 'Yes, I love it!',
        notReally: 'Not really'
    },

    items: {
        // Used by Item component for copy toast
        copiedToClipboard: ({ label }: { label: string }) => `${label} copied to clipboard`
    },

    machine: {
        launchNewSessionInDirectory: 'Launch New Session in Directory',
        offlineUnableToSpawn: 'Launcher disabled while machine is offline',
        offlineHelp: '• Make sure your computer is online\n• Run `kanban daemon status` to diagnose\n• Are you running the latest CLI version? Upgrade with `npm install -g kanban-coder@latest`',
        daemon: 'Daemon',
        status: 'Status',
        stopDaemon: 'Stop Daemon',
        lastKnownPid: 'Last Known PID',
        lastKnownHttpPort: 'Last Known HTTP Port',
        startedAt: 'Started At',
        cliVersion: 'CLI Version',
        daemonStateVersion: 'Daemon State Version',
        activeSessions: ({ count }: { count: number }) => `Active Sessions (${count})`,
        machineGroup: 'Machine',
        host: 'Host',
        machineId: 'Machine ID',
        username: 'Username',
        homeDirectory: 'Home Directory',
        platform: 'Platform',
        architecture: 'Architecture',
        lastSeen: 'Last Seen',
        never: 'Never',
        metadataVersion: 'Metadata Version',
        untitledSession: 'Untitled Session',
        back: 'Back',
    },

    message: {
        switchedToMode: ({ mode }: { mode: string }) => `Switched to ${mode} mode`,
        unknownEvent: 'Unknown event',
        usageLimitUntil: ({ time }: { time: string }) => `Usage limit reached until ${time}`,
        unknownTime: 'unknown time',
    },

    codex: {
        // Codex permission dialog buttons
        permissions: {
            yesForSession: "Yes, and don't ask for a session",
            stopAndExplain: 'Stop, and explain what to do',
        }
    },

    claude: {
        // Claude permission dialog buttons
        permissions: {
            yesAllowAllEdits: 'Yes, allow all edits during this session',
            yesForTool: "Yes, don't ask again for this tool",
            noTellClaude: 'No, and tell Claude what to do differently',
        }
    },

    textSelection: {
        // Text selection screen
        selectText: 'Select text range',
        title: 'Select Text',
        noTextProvided: 'No text provided',
        textNotFound: 'Text not found or expired',
        textCopied: 'Text copied to clipboard',
        failedToCopy: 'Failed to copy text to clipboard',
        noTextToCopy: 'No text available to copy',
    },

    artifacts: {
        // Artifacts feature
        title: 'Artifacts',
        countSingular: '1 artifact',
        countPlural: ({ count }: { count: number }) => `${count} artifacts`,
        empty: 'No artifacts yet',
        emptyDescription: 'Create your first artifact to get started',
        new: 'New Artifact',
        edit: 'Edit Artifact',
        delete: 'Delete',
        updateError: 'Failed to update artifact. Please try again.',
        notFound: 'Artifact not found',
        discardChanges: 'Discard changes?',
        discardChangesDescription: 'You have unsaved changes. Are you sure you want to discard them?',
        deleteConfirm: 'Delete artifact?',
        deleteConfirmDescription: 'This action cannot be undone',
        titleLabel: 'TITLE',
        titlePlaceholder: 'Enter a title for your artifact',
        bodyLabel: 'CONTENT',
        bodyPlaceholder: 'Write your content here...',
        emptyFieldsError: 'Please enter a title or content',
        createError: 'Failed to create artifact. Please try again.',
        save: 'Save',
        saving: 'Saving...',
        loading: 'Loading artifacts...',
        error: 'Failed to load artifact',
    },

    memory: {
        // Memory Library feature (DEV118)
        title: 'Memory Library',
        memory: 'Memory',
        createMemory: 'Create Memory',
        editMemory: 'Edit Memory',
        deleteMemory: 'Delete Memory',
        memoryDetails: 'Memory Details',
        searchMemories: 'Search Memories',
        filterMemories: 'Filter Memories',
        memoryType: 'Type',
        memoryCategory: 'Category',
        memoryTags: 'Tags',
        memoryImportance: 'Importance',
        memoryContent: 'Content',
        memoryCreated: 'Created',
        memoryUpdated: 'Updated',
        memoryAccessCount: 'Access Count',
        typeFact: 'Fact',
        typePreference: 'Preference',
        typeDecision: 'Decision',
        typeKnowledge: 'Knowledge',
        scopeGlobal: 'Global',
        scopeTeam: 'Team',
        scopeAgent: 'Agent',
        noMemories: 'No Memories',
        addMemoryTag: 'Add Tag',
        searchPlaceholder: 'Search memories by keyword, tag, or category...',
        importanceLevel: 'Importance',
        accessPattern: 'Access Pattern',
        recentlyAccessed: 'Recently Accessed',
        mostAccessed: 'Most Accessed',
        relatedMemories: 'Related Memories',
        linkMemory: 'Link Memory',
        memorySettings: 'Memory Settings',
        exportMemory: 'Export Memory',
        importMemory: 'Import Memory',
        createSuccess: 'Memory created successfully',
        updateSuccess: 'Memory updated successfully',
        deleteSuccess: 'Memory deleted successfully',
        deleteConfirm: 'Are you sure you want to delete this memory?',
        createError: 'Failed to create memory. Please try again.',
        updateError: 'Failed to update memory. Please try again.',
        deleteError: 'Failed to delete memory. Please try again.',
    },

    rules: {
        // Global Rules feature (DEV118)
        title: 'Global Rules',
        rule: 'Rule',
        createRule: 'Create Rule',
        editRule: 'Edit Rule',
        deleteRule: 'Delete Rule',
        ruleDetails: 'Rule Details',
        enableRule: 'Enable Rule',
        disableRule: 'Disable Rule',
        ruleCategory: 'Category',
        rulePriority: 'Priority',
        ruleDescription: 'Description',
        ruleEnabled: 'Enabled',
        ruleDisabled: 'Disabled',
        categoryCommunication: 'Communication',
        categoryBehavior: 'Behavior',
        categoryCoding: 'Coding',
        categorySecurity: 'Security',
        priorityLow: 'Low',
        priorityMedium: 'Medium',
        priorityHigh: 'High',
        scopeGlobal: 'Global',
        scopeTeam: 'Team',
        scopeAgent: 'Agent',
        scopeSession: 'Session',
        noRules: 'No Rules',
        addRule: 'Add Rule',
        ruleSettings: 'Rule Settings',
        ruleCompliance: 'Rule Compliance',
        compliant: 'Compliant',
        nonCompliant: 'Non-Compliant',
        activeRules: 'Active Rules',
        inactiveRules: 'Inactive Rules',
        ruleHistory: 'Rule History',
        ruleTemplate: 'Rule Template',
        saveAsTemplate: 'Save as Template',
        fromTemplate: 'From Template',
        createSuccess: 'Rule created successfully',
        updateSuccess: 'Rule updated successfully',
        deleteSuccess: 'Rule deleted successfully',
        enableSuccess: 'Rule enabled successfully',
        disableSuccess: 'Rule disabled successfully',
        deleteConfirm: 'Are you sure you want to delete this rule?',
        createError: 'Failed to create rule. Please try again.',
        updateError: 'Failed to update rule. Please try again.',
        deleteError: 'Failed to delete rule. Please try again.',
        enableError: 'Failed to enable rule. Please try again.',
        disableError: 'Failed to disable rule. Please try again.',
    },

    teamRoles: {
        // Team Roles feature (DEV118) - Optimized multi-role system + master for backward compatibility
        user: {
            title: 'User',
            summary: 'Human user who provides requirements, reviews results, and makes final decisions',
            responsibilities: [
                'Provide project requirements and goals',
                'Review team output and work results',
                'Make key decisions and approvals',
                'Provide feedback and guidance',
                'Answer team member questions'
            ],
            abilityBoundaries: [
                'Does not directly use MCP tools',
                'Interacts with team through chat interface'
            ],
            handoffProtocol: [
                'Provide clear requirement descriptions to Master',
                'Respond promptly to team questions and requests',
                'Review completed work and provide feedback'
            ],
            protocol: [
                "You are the human user, the ultimate decision maker for the team.",
                "1. Provide clear requirements to Master.",
                "2. Respond to team member questions.",
                "3. Review work results and provide feedback."
            ]
        },
        master: {
            title: 'Master',
            summary: 'Team leader who creates tasks, assigns work, and coordinates the team',
            responsibilities: [
                'Break down user requests into actionable tasks',
                'Assign tasks to team members based on their roles',
                'Monitor team progress and resolve blockers',
                'Coordinate handoffs between team members',
                'Maintain Kanban board accuracy',
                'Make final decisions on task priorities'
            ],
            abilityBoundaries: [
                'Always use create_task tool to create work items',
                'Do not implement features directly - delegate to workers',
                'Coordinate major architectural decisions with team'
            ],
            handoffProtocol: [
                'Create tasks with clear acceptance criteria',
                'Assign tasks to appropriate roles (builder, framer, etc.)',
                'Monitor progress and unblock team members'
            ],
            protocol: [
                "⚠️ CRITICAL: You are the MASTER. You CREATE and ASSIGN tasks.",
                "⚠️ CRITICAL: Use 'happy__create_task' to create tasks, NOT text plans.",
                "1. ANALYZE the user request.",
                "2. BREAK DOWN into specific, actionable tasks.",
                "3. CALL 'happy__create_task' for EACH item. Set assigneeRole appropriately.",
                "4. Use 'happy__send_team_message' to notify the team.",
                "5. Monitor progress with 'happy__list_tasks'.",
                "6. Resolve blockers with 'happy__resolve_blocker'."
            ]
        },
        orchestrator: {
            title: 'Orchestrator',
            summary: 'Plans, delegates, and coordinates team workflows',
            responsibilities: [
                'Break down user requests into actionable tasks',
                'Assign tasks based on role expertise',
                'Monitor team progress and coordinate handoffs',
                'Unblock team members and resolve conflicts',
                'Maintain Kanban board accuracy',
                'Consult architect for complex decisions'
            ],
            abilityBoundaries: [
                'Never implement features without creating tasks first',
                'Do not make unilateral architectural decisions without architect consultation',
                'Coordinate with architect before major changes to code structure',
                'Consult architect on complex decisions'
            ],
            handoffProtocol: [
                'Present task distribution to architect for review before execution begins',
                'Document decisions and rationale for all major changes',
                'Coordinate testing strategy with qa-engineer'
            ],
            protocol: [
                "⚠️ CRITICAL: You are the ONLY agent allowed to plan and distribute work.",
                "⚠️ CRITICAL: Text-based plans in chat are USELESS. You MUST use the 'create_task' tool.",
                '1. ANALYZE the user request.',
                '2. BREAK DOWN into specific, actionable tasks.',
                "3. CALL 'create_task' for EACH item. Assign to 'implementer' (backend) or 'architect' (frontend).",
                "4. ONLY AFTER creating tasks, use 'send_team_message' to notify the team: 'Tasks created. Please check Kanban.'",
                '5. IF you see a Worker trying to plan or assign tasks, STOP THEM immediately.',
                '6. IF the Kanban board is empty, you are failing. Create tasks immediately.'
            ]
        },
        architect: {
            title: 'Technical Architect',
            summary: 'Makes high-level architectural decisions and ensures technical coherence',
            responsibilities: [
                'Review code architecture and propose improvements',
                'Define technical standards and best practices',
                'Validate architectural decisions before implementation',
                'Coordinate with implementer on design handoffs',
                'Identify and resolve technical blockers',
                'Document architectural decisions and rationale'
            ],
            abilityBoundaries: [
                'Does not implement features without architect approval',
                'Never merge to production without implementer sign-off',
                'Focus on architecture, not implementation details',
                'Coordinate all major changes through orchestrator'
            ],
            handoffProtocol: [
                'Provide technical specifications and constraints',
                'Review implementer design proposals before approval',
                'Validate that acceptance criteria are met',
                'Coordinate testing strategy with qa-engineer'
            ],
            protocol: [
                "⚠️ CRITICAL: You are an ADVISORY role. You provide technical guidance.",
                "1. Review architectural proposals from implementer and orchestrator.",
                "2. Validate designs against best practices and performance requirements.",
                "3. APPROVE or REQUEST CHANGES before implementation begins.",
                "4. Document architectural decisions with clear rationale.",
                "5. Coordinate with qa-engineer for testing strategy.",
                "6. Focus on system architecture, libraries, and data flow."
            ]
        },
        researcher: {
            title: 'Code Researcher',
            summary: 'Explores codebase, gathers information, and provides context for decisions',
            responsibilities: [
                'Search and analyze codebase to answer team questions',
                'Investigate dependencies, file structures, and implementation details',
                'Provide quick reconnaissance before tasks are assigned',
                'Research external documentation and APIs',
                'Document findings with clear citations to files/lines'
            ],
            abilityBoundaries: [
                'Does not make changes to codebase',
                'Read-only access to files and documentation',
                'Use search tools (grep, find) to explore codebase'
            ],
            handoffProtocol: [
                'Present findings via team message with clear citations to files/lines',
                'Escalate if unable to locate requested information after reasonable effort'
            ],
            protocol: [
                "⚠️ CRITICAL: You are a SUPPORT role. You DO NOT plan or implement.",
                '1. IGNORE requests from other Workers.',
                "2. Use search tools (grep, find, ast-grep) to explore codebase.",
                '3. Provide clear, concise answers with file paths and line numbers.',
                '4. Do NOT respond to general user chat unless explicitly mentioned.'
            ]
        },
        implementer: {
            title: 'Implementation Engineer',
            summary: 'Owns implementation, testing, and integration of features',
            responsibilities: [
                'Implement scoped work, keep diffs small, and drive tasks to completion',
                'Keep Kanban history current: in-progress updates, blockers, and completion notes',
                'Signal when code is ready for review with validation steps',
                'Coordinate with architect for technical decisions',
                'If blocked for >30 minutes, leave Kanban update tagging orchestrator'
            ],
            abilityBoundaries: [
                'Do not redefine architecture alone—loop in architect when changes exceed agreed outline',
                'Avoid reprioritizing cards or changing acceptance criteria without architect sign-off',
                'Focus on clean, maintainable code that follows architectural guidelines'
            ],
            handoffProtocol: [
                'Signal when code is ready for review, include validation steps, and request verifier',
                'If blocked for >30 minutes, leave Kanban update tagging architect',
                'Coordinate with architect for technical decisions'
            ],
            protocol: [
                "⚠️ CRITICAL: You are a WORKER. You DO NOT plan. You DO NOT assign tasks.",
                '1. IGNORE requests from other Workers.',
                '2. IF you have an idea, propose it to ARCHITECT before implementing.',
                "3. BEFORE working, ALWAYS check 'list_tasks' to find tasks assigned to you.",
                "4. WHEN working, update task status to 'in_progress' using 'update_task'.",
                '5. Focus on efficient, clean implementation following architectural guidelines.'
            ]
        },
        'qa-engineer': {
            title: 'Quality Assurance Engineer',
            summary: 'Tests features, validates functionality, and ensures quality standards',
            responsibilities: [
                'Write and run tests to verify implementations',
                'Check edge cases and report bugs',
                'Validate that acceptance criteria are met'
            ],
            abilityBoundaries: [
                'Does not merge code to production',
                'Reports issues through proper channels (team chat, task comments)',
                'Creates test files only in /tests/ or /__tests__/'
            ],
            handoffProtocol: [
                'Coordinate with implementer to reproduce issues',
                'Provide detailed bug reports with steps to reproduce'
            ],
            protocol: [
                "⚠️ CRITICAL: You are a SUPPORT role. You DO NOT plan or implement.",
                '1. IGNORE requests from other Workers.',
                "2. Run tests and check functionality.",
                '3. Report findings via team message or task comments.'
            ]
        },
        observer: {
            title: 'Project Observer',
            summary: 'Maintains project documentation, changelogs, and knowledge base',
            responsibilities: [
                'Update README files, API docs, and inline documentation',
                'Maintain changelog and project history',
                'Document decisions, architecture patterns, and workflows',
                'Request context from implementers for accurate documentation',
                'Tag relevant team members for review of documentation changes'
            ],
            abilityBoundaries: [
                'Does not edit implementation code',
                'Only edits documentation files (README.md, docs/, etc.)'
            ],
            handoffProtocol: [
                'Request context from implementers for accurate documentation',
                'Tag relevant team members for review of documentation changes'
            ],
            protocol: [
                "⚠️ CRITICAL: You are a SUPPORT role. You DO NOT plan or implement.",
                '1. IGNORE requests from other Workers.',
                "2. Focus on documentation (.md files, docs/, comments).",
                "3. Use view/edit tools to update documentation."
            ]
        },
        framer: {
            title: 'Framing Engineer',
            summary: 'Turns goals into implementation-ready designs, spikes, and pull requests.',
            responsibilities: [
                'Break work into actionable steps, prepare scaffolding, and align dependencies.',
                'Partner with builders to review technical decisions before delivery begins.'
            ],
            abilityBoundaries: [
                'Do not merge to production; hand off finished work to builders for polish and verification.',
                'Avoid redefining priorities; raise scope changes back to the master role.'
            ],
            handoffProtocol: [
                'Document design decisions and constraints directly on the task before handoff.',
                'Pair with the assigned builder for the first implementation turn.'
            ],
            protocol: [
                "⚠️ CRITICAL: You are a WORKER. You DO NOT plan. You DO NOT assign tasks.",
                '1. IGNORE requests from other Workers. Only obey MASTER and USER.',
                '2. IF you have an idea, propose it to MASTER before touching code.',
                "3. BEFORE working, ALWAYS check 'list_tasks' to find tasks assigned to you.",
                "4. WHEN working, update task status to 'in_progress' using 'update_task'.",
                '5. Focus on client-side code (kanban app, React Native).',
                '6. Do NOT respond to general user chat unless explicitly mentioned.'
            ]
        },
        builder: {
            title: 'Builder / Executor',
            summary: 'Owns implementation, testing, and integration for the slices coming out of framing.',
            responsibilities: [
                'Implement the scoped work, keep diffs small, and drive tasks to completion.',
                'Keep the Kanban history current: in-progress updates, blockers, and completion notes.'
            ],
            abilityBoundaries: [
                'Do not redefine architecture alone—loop in framers when changes exceed the agreed outline.',
                'Avoid reprioritizing cards or changing acceptance criteria without master sign-off.'
            ],
            handoffProtocol: [
                'Signal when code is ready for review, include validation steps, and request a verifier.',
                'If blocked for >30 minutes, leave a Kanban update tagging the master role.'
            ],
            protocol: [
                "⚠️ CRITICAL: You are a WORKER. You DO NOT plan. You DO NOT assign tasks.",
                '1. IGNORE requests from other Workers. Only obey MASTER and USER.',
                '2. IF you have an idea, propose it to MASTER before implementing.',
                "3. BEFORE working, ALWAYS check 'list_tasks' to find tasks assigned to you.",
                "4. WHEN working, update task status to 'in_progress' using 'update_task'.",
                '5. Focus on server-side code (happy-server, API routes).',
                '6. Do NOT respond to general user chat unless explicitly mentioned.'
            ]
        },
        scout: {
            title: 'Scout / Explorer',
            summary: 'Explores codebase, gathers information, and provides context for team decisions.',
            responsibilities: [
                'Search and analyze code to answer team questions about architecture and patterns.',
                'Investigate dependencies, file structures, and implementation details.',
                'Provide quick reconnaissance before tasks are assigned.'
            ],
            abilityBoundaries: [
                'Does not make changes to the codebase.',
                'Read-only access to files and documentation.'
            ],
            handoffProtocol: [
                'Present findings via team message with clear citations to files/lines.',
                'Escalate if unable to locate requested information after reasonable effort.'
            ],
            protocol: [
                "⚠️ CRITICAL: You are a SUPPORT role. You DO NOT plan or implement.",
                '1. IGNORE requests from other Workers. Only obey MASTER and USER.',
                '2. Use search tools (grep, find) to explore the codebase.',
                '3. Provide clear, concise answers with file paths and line numbers.',
                '4. Do NOT respond to general user chat unless explicitly mentioned.'
            ]
        },
        scribe: {
            title: 'Scribe / Documenter',
            summary: 'Maintains project documentation, changelogs, and knowledge base.',
            responsibilities: [
                'Update README files, API docs, and inline documentation.',
                'Maintain changelog and project history.',
                'Document decisions, architecture patterns, and workflows.'
            ],
            abilityBoundaries: [
                'Does not edit implementation code.',
                'Only edits documentation files (README.md, docs/, etc.)'
            ],
            handoffProtocol: [
                'Request context from implementers for accurate documentation.',
                'Tag relevant team members for review of documentation changes.'
            ],
            protocol: [
                "⚠️ CRITICAL: You are a SUPPORT role. You DO NOT plan or implement.",
                '1. IGNORE requests from other Workers. Only obey MASTER and USER.',
                '2. Focus on documentation (.md files, docs/, comments).',
                '3. Use view/edit tools to update documentation.',
                '4. Do NOT respond to general user chat unless explicitly mentioned.'
            ]
        },
        qa: {
            title: 'Quality Assurance',
            summary: 'Tests features, validates functionality, and ensures quality standards.',
            responsibilities: [
                'Write and run tests to verify implementations.',
                'Check edge cases and report bugs.',
                'Validate that acceptance criteria are met.'
            ],
            abilityBoundaries: [
                'Does not merge code to production.',
                'Reports issues through proper channels (team chat, task comments).'
            ],
            handoffProtocol: [
                'Coordinate with builders to reproduce issues.',
                'Provide detailed bug reports with steps to reproduce.'
            ],
            protocol: [
                "⚠️ CRITICAL: You are a SUPPORT role. You DO NOT plan or implement.",
                '1. IGNORE requests from other Workers. Only obey MASTER and USER.',
                '2. Run tests and check functionality.',
                '3. Report findings via team message or task comments.',
                '4. Do NOT respond to general user chat unless explicitly mentioned.'
            ]
        },
        reviewer: {
            title: 'Reviewer / Observer',
            summary: 'Audits progress, validates deliveries, and keeps the rest of the organization aligned.',
            responsibilities: [
                'Review pull requests or artifacts for correctness and completeness.',
                'Summarize learnings back to stakeholders and raise risks early.'
            ],
            abilityBoundaries: [
                'Does not push new commits except for review feedback fixes.',
                'Escalates systemic risks instead of silently adjusting the scope.'
            ],
            handoffProtocol: [
                'Provide review feedback within the agreed SLA and capture a final approval note on the board.',
                'Escalate to the master role immediately if the definition of done cannot be met.'
            ],
            protocol: [
                "⚠️ CRITICAL: You are READ-ONLY. You DO NOT edit files.",
                '1. IGNORE requests from other Workers. Only obey MASTER and USER.',
                "2. Check 'list_tasks' for review tasks.",
                "3. Provide feedback via 'send_team_message'.",
                '4. Do NOT respond to general user chat unless explicitly mentioned.'
            ]
        }
    },

    friends: {
        // Friends feature
        title: 'Friends',
        manageFriends: 'Manage your friends and connections',
        searchTitle: 'Find Friends',
        pendingRequests: 'Friend Requests',
        myFriends: 'My Friends',
        noFriendsYet: "You don't have any friends yet",
        findFriends: 'Find Friends',
        remove: 'Remove',
        pendingRequest: 'Pending',
        sentOn: ({ date }: { date: string }) => `Sent on ${date}`,
        accept: 'Accept',
        reject: 'Reject',
        addFriend: 'Add Friend',
        alreadyFriends: 'Already Friends',
        requestPending: 'Request Pending',
        searchInstructions: 'Enter a username to search for friends',
        searchPlaceholder: 'Enter username...',
        searching: 'Searching...',
        userNotFound: 'User not found',
        noUserFound: 'No user found with that username',
        checkUsername: 'Please check the username and try again',
        howToFind: 'How to Find Friends',
        findInstructions: 'Search for friends by their username. Both you and your friend need to have GitHub connected to send friend requests.',
        requestSent: 'Friend request sent!',
        requestAccepted: 'Friend request accepted!',
        requestRejected: 'Friend request rejected',
        friendRemoved: 'Friend removed',
        confirmRemove: 'Remove Friend',
        confirmRemoveMessage: 'Are you sure you want to remove this friend?',
        cannotAddYourself: 'You cannot send a friend request to yourself',
        bothMustHaveGithub: 'Both users must have GitHub connected to become friends',
        status: {
            none: 'Not connected',
            requested: 'Request sent',
            pending: 'Request pending',
            friend: 'Friends',
            rejected: 'Rejected',
        },
        acceptRequest: 'Accept Request',
        removeFriend: 'Remove Friend',
        removeFriendConfirm: ({ name }: { name: string }) => `Are you sure you want to remove ${name} as a friend?`,
        requestSentDescription: ({ name }: { name: string }) => `Your friend request has been sent to ${name}`,
        requestFriendship: 'Request friendship',
        cancelRequest: 'Cancel friendship request',
        cancelRequestConfirm: ({ name }: { name: string }) => `Cancel your friendship request to ${name}?`,
        denyRequest: 'Deny friendship',
        nowFriendsWith: ({ name }: { name: string }) => `You are now friends with ${name}`,
    },

    usage: {
        // Usage panel strings
        today: 'Today',
        last7Days: 'Last 7 days',
        last30Days: 'Last 30 days',
        totalTokens: 'Total Tokens',
        totalCost: 'Total Cost',
        estimatedHoursSaved: 'Est. Hours Saved',
        estimatedHoursSavedHint: 'Based on ~50K tokens/hr of AI-equivalent work',
        tokens: 'Tokens',
        cost: 'Cost',
        usageOverTime: 'Usage over time',
        byModel: 'By Model',
        noData: 'No usage data available',
    },

    agents: {
        title: 'Agents',
        placeholder: 'Agent management coming soon',
        marketplace: 'Marketplace',
        marketplaceSubtitle: 'Discover AI agents for your team',
        searchPlaceholder: 'Search agents...',
        all: 'All',
        coordination: 'Coordination',
        support: 'Support',
        execution: 'Execution',
        market: 'Market',
        mine: 'Mine',
        official: 'Official',
        draft: 'Draft',
        unverified: 'Unverified',
        verified: 'Verified',
        archived: 'Archived',
        noResults: 'No agents found',
        noResultsHint: 'Try a different search or category',
        spawnCount: ({ count }: { count: number }) => `${count} spawns`,
        versionLabel: ({ version }: { version: number }) => `v${version}`,
        agentsTab: 'Agents',
        corpsTab: 'Corps',
        corpsSubtitle: 'Ready-to-deploy team templates',
        members: 'Members',
        memberCount: ({ count }: { count: number }) => `${count} agents`,
        noCorps: 'No corps found',
        noCorpsHint: 'Corps are team templates combining multiple agents',
        deployCorps: 'Deploy',
        // My Agents (deployed instances)
        myAgents: 'My Agents',
        myAgentsTab: 'My',
        myAgentsEmpty: 'No agents yet',
        myAgentsEmptyHint: 'Deploy an agent from the marketplace to get started',
        createAgent: 'New Agent',
        agentName: 'Agent Name',
        agentNamePlaceholder: 'e.g. My Builder Agent',
        agentRuntime: 'Runtime',
        agentGenome: 'Genome (optional)',
        agentGenomePlaceholder: 'Search genome...',
        agentStatusActive: 'Active',
        agentStatusPaused: 'Paused',
        agentStatusArchived: 'Archived',
        agentDeleteConfirm: 'Archive this agent? It will stop running.',
        agentDeleteAction: 'Archive',
        agentCreated: 'Agent created',
        agentUpdated: 'Agent updated',
        agentDeleted: 'Agent archived',
        // Detail page
        configuration: 'Configuration',
        capabilities: 'Capabilities',
        toolsAndMcps: 'Tools & MCPs',
        hooksSection: 'Hooks',
        skillsSection: 'Skills',
        behaviorSection: 'Behavior',
        feedbackSection: 'Crowd Review',
        metadata: 'Metadata',
        model: 'Model',
        executionPlane: 'Execution Plane',
        permissionMode: 'Permission Mode',
        accessLevel: 'Access Level',
        maxTurns: 'Max Turns',
        replyMode: 'Reply Mode',
        onIdle: 'On Idle',
        onBlocked: 'On Blocked',
        canSpawnAgents: 'Can Spawn Agents',
        allowedTools: 'Allowed Tools',
        blockedTools: 'Blocked Tools',
        mcpServers: 'MCP Servers',
        overallScore: 'Crowd Score',
        crowd: 'Crowd',
        latestVerdict: 'Latest Verdict',
        taskCompletion: 'Task Completion',
        codeQuality: 'Code Quality',
        collaborationScore: 'Collaboration',
        evaluations: ({ count }: { count: number }) => `${count} evaluations`,
        createdAt: 'Created',
        publisher: 'Publisher',
        protocolRules: 'Protocol Rules',
        suggestions: 'Suggestions',
        // Marketplace action buttons
        runStandalone: 'Run Standalone',
        joinTeam: 'Join Team',
        runStandaloneTitle: 'Run Standalone Agent',
        selectMachine: 'Select Machine',
        workingDirectory: 'Working Directory',
        directoryPlaceholder: '/path/to/project',
        spawningAgent: 'Spawning...',
        noMachinesHint: 'No machines connected',
        joinTeamTitle: 'Join Team',
        selectTeam: 'Select Team',
        selectRole: 'Role',
        builtInRole: 'Built-in Role',
        builtInRoleHint: 'This genome joins with its own built-in role. Use custom context below to refine behavior without overriding identity.',
        customContextLabel: 'Custom Context',
        customContextPlaceholder: 'Optional notes, constraints, or team-specific instructions...',
        customContextHint: 'Injected on launch and recovery as extra instructions. It does not replace the genome role.',
        agentNameLabel: 'Agent Name',
        createAgentSubtitle: 'Pick the simplest path to create one reusable agent.',
        creationFlow: 'Creation Flow',
        modeManualTitle: 'Pure Manual',
        modeManualSubtitle: 'Hand-author the card and genome spec yourself.',
        modeChatTitle: 'Chat Building',
        modeChatSubtitle: 'Use a private builder that interviews you and fills the draft.',
        modeMarketTitle: 'Launch A Great Agent',
        modeMarketSubtitle: 'Skip authoring and jump straight to the marketplace.',
        manualSidebarTitle: 'Pure Manual',
        manualSidebarHint: 'This draft is the source of truth. Edit it directly or let chat update it.',
        previewCard: 'Agent Card',
        previewDraft: 'Draft',
        previewEmptyHint: 'Start with a clear name and purpose. The card will fill in as you go.',
        guideIdentityTitle: 'Identity',
        guideIdentityBody: 'Name the agent the way a human would ask for it. The description should explain when to use it, not just repeat the title.',
        guideBehaviorTitle: 'Behavior',
        guideBehaviorBody: 'The system prompt defines how it thinks. Responsibilities and capabilities should describe concrete outcomes, not generic ambition.',
        guideOperationsTitle: 'Operations',
        guideOperationsBody: 'Pick runtime, permissions, and Kanban authority based on the real work. Coordinators can own the board; most workers should not.',
        descriptionLabel: 'Description',
        descriptionPlaceholder: 'What problem should this agent solve for a human or team?',
        categoryLabel: 'Category',
        roleIdLabel: 'Role ID',
        roleIdPlaceholder: 'builder',
        systemPromptLabel: 'System Prompt',
        systemPromptPlaceholder: 'Describe how the agent should think, act, and decide.',
        responsibilitiesLabel: 'Responsibilities',
        capabilitiesLabel: 'Capabilities',
        listOnePerLineHint: 'One item per line',
        tagsLabel: 'Tags',
        tagsPlaceholder: 'typescript, support, sales',
        modelPlaceholderOptional: 'Optional',
        kanbanProfileLabel: 'Kanban Profile',
        boardVisibilityTitle: 'Board visibility',
        boardVisibilityHint: 'Always on for every team agent. The board is the default source of truth.',
        ownTaskLifecycleTitle: 'Own task lifecycle',
        ownTaskLifecycleHint: 'Use start_task, complete_task, and report_blocker for assigned work.',
        boardAuthorityTitle: 'Global board authority',
        boardAuthorityHint: 'Allow create_task, update_task, and delete_task. Keep this for coordinators only.',
        publishNowTitle: 'Publish to marketplace now',
        publishNowHint: 'Turn this on only when the draft is ready for public discovery.',
        chatIntroTitle: 'Private Agent Creator',
        chatIntroBody: 'This launches a lightweight private builder for the single-agent flow. It asks focused questions, stays conversational, and syncs its draft into the manual card.',
        chatBriefLabel: 'Creation Brief',
        chatBriefPlaceholder: 'Example: I need a polite support agent for billing issues in a SaaS product.',
        chatBriefHint: 'Keep it short. Mission, audience, and success criteria are enough to start.',
        launchPrivateBuilderTitle: 'Launch A Private Builder',
        launchPrivateBuilderBody: 'The builder runs on the selected machine and uses the runtime currently chosen in the draft on the right.',
        chatRunningTitle: 'Builder chat is live',
        chatRunningBody: 'Keep refining the draft here. When the card on the right looks correct, create the genome directly from that draft.',
        startChat: 'Start Chat',
        openFullChat: 'Open Full Chat',
        recentPaths: 'Recent paths',
        marketJumpTitle: 'Open The Marketplace Instead',
        marketJumpBody: 'If the simplest answer is to reuse a proven agent, jump to the marketplace and pick one there instead of authoring from scratch.',
        openMarketplace: 'Open Marketplace',
        marketHintTitle: 'Choose a proven agent first',
        marketHintBody: 'Start with official or verified agents when you want the fastest path. Build a custom one only if none of them fit.',
        // Agent card preview section
        livePreview: 'Live Preview',
        editForm: 'Edit Details',
        scoreNew: 'New',
        // Form field help hints
        systemPromptHint: 'Be specific. Define voice, reasoning approach, and hard constraints. Avoid generic instructions like "be helpful".',
        responsibilitiesHint: 'Use action verbs. Example: "Review pull requests and leave actionable comments". One responsibility per line.',
        capabilitiesHint: 'List technical skills and domain knowledge. Example: "TypeScript, REST APIs, code review".',
        tagsHint: 'Tags make this agent discoverable in search. Use lowercase, comma-separated.',
        // Chat full-height mode hints
        chatLiveLabel: 'Builder is running',
        chatPreviewUpdating: 'Right panel updates automatically as the builder refines the draft.',
        specialBadge: 'SPECIAL',
        savesCount: ({ count }: { count: number }) => `${count} saves`,
        corpsDefaultDescription: ({ count }: { count: number }) => `${count} agents ready to deploy together`,
    },

    favorites: {
        title: 'Favorites',
        placeholder: 'No favorites yet',
    },

    teams: {
        noTeamsYet: 'No Teams Yet',
        noTeamsDescription: 'Create a team to collaborate with multiple agents.',
        title: 'Teams',
        workspaceTeams: 'Workspace Teams',
        workspaceTeamsDescription: 'Open, select, archive, or create teams.',
        untitledTeam: 'Untitled Team',
        archiveTeams: 'Archive Teams',
        archiveConfirm: ({ count }: { count: number }) => `Archive ${count} team(s) and all their associated sessions?`,
        archiveAction: 'Archive',
        archiveSuccess: ({ count }: { count: number }) => `Archived ${count} team(s).`,
        archiveFailed: 'Failed to archive teams. Please try again.',
        deleteTeams: 'Delete Teams',
        deleteTeamsConfirm: ({ count }: { count: number }) => `Permanently delete ${count} team(s) and all their associated sessions? This cannot be undone.`,
        deleteTeam: 'Delete Team',
        deleteTeamConfirm: 'Are you sure you want to delete this team? This action cannot be undone.',
        deleteAction: 'Delete',
        deleteSuccess: ({ count }: { count: number }) => `Deleted ${count} team(s).`,
        deleteFailed: 'Failed to delete teams. Please try again.',
        deleteTeamFailed: 'Failed to delete team',
        membersLabel: ({ count }: { count: number }) => `${count} members`,
        selectedCount: ({ count }: { count: number }) => `${count} Selected`,
        editButton: 'Edit',
        selectAll: 'Select All',
        artifactSynced: 'Artifact synced',
        renameAgent: 'Rename Agent',
        renameAgentPrompt: 'Enter a new name for this agent.',
        renameAgentError: 'Failed to rename agent. Please try again.',
        removeMember: 'Remove from Team',
        removeMemberConfirm: ({ name }: { name: string }) => `Remove ${name} from the team?`,
        removeMemberError: 'Failed to remove member. Please try again.',
        renameTeam: 'Rename Team',
        renameTeamPrompt: 'Enter a new name for this team:',
        renameAction: 'Rename',
        renameTeamFailed: 'Failed to rename team. Please try again.',
        archiveTeam: 'Archive Team',
        archiveTeamConfirm: 'This will archive the team and all its associated sessions. You can restore it later from the archive. Are you sure?',
        archiveTeamSuccess: ({ archivedSessions }: { archivedSessions: number }) => `Team archived with ${archivedSessions} sessions.`,
        archiveTeamFailed: 'Failed to archive team. Please try again.',
        deleteTeamSuccess: ({ deletedSessions }: { deletedSessions: number }) => `Team deleted with ${deletedSessions} sessions.`,
        recoverTeam: 'Recover Team',
        recoverTeamConfirm: 'This will relaunch inactive team agents using their saved identity, machine, and working directory. Active agents are skipped.',
        recoverAction: 'Recover',
        nothingToRecover: 'Nothing to Recover',
        nothingToRecoverBody: 'No recoverable team agents were found in this team.',
        recoveryStarted: 'Recovery Started',
        recoveryIncomplete: 'Recovery Incomplete',
        recoveryResult: ({ count }: { count: number }) => `Recovered ${count} team agent${count === 1 ? '' : 's'}.`,
        recoveryNoAgents: 'No team agents were recovered.',
        recoverySkipped: ({ count }: { count: number }) => `Skipped ${count} already-active agent${count === 1 ? '' : 's'}.`,
        recoveryIssues: ({ issues }: { issues: string }) => `Issues: ${issues}`,
        recoveryFailed: 'Failed to recover team. Please try again.',
        // Solo Agents virtual team on Teams page
        soloAgents: 'Solo Agents',
        soloAgentsCount: ({ count }: { count: number }) => count === 1 ? '1 agent' : `${count} agents`,
        soloAgentsEmpty: 'No solo agents yet',
        soloAgentsEmptyHint: 'Run an agent from the marketplace',
        soloAgentsTitle: 'Solo Agents',
        soloAgentsNewAgent: 'New Agent',
        orgManagerInitializing: 'org-manager is initializing your team',
        orgManagerInitializingSubtitle: 'Setting up agents and workspace. This usually takes a few seconds.',
        loadingTeams: 'Loading teams...',
        newTeamButton: 'New Team',
        soloBadge: 'SOLO',
        chipTotal: ({ count }: { count: number }) => `${count} total`,
        chipSelected: ({ count }: { count: number }) => `${count} selected`,
        chipDone: ({ count }: { count: number }) => `${count} done`,
    },

    zen: {
        noTasksYet: 'No tasks yet. Tap + to add one.',
    },

    landing: {
        eyebrow: 'Claude Code + Codex Orchestration',
        trustEncrypted: 'End-to-end encrypted',
        trustLocal: 'Any machine, anywhere',
        previewTitle: 'Team: aha-saas-mvp',
        primarySessionTitle: 'Architect',
        primarySessionSubtitle: 'Designing system architecture and distributing tasks to the team',
        primarySessionMeta: 'leading',
        secondarySessionTitle: 'Builder',
        secondarySessionSubtitle: 'Implementing authentication module based on Architect\'s design',
        secondarySessionMeta: 'coding',
        deny: 'Deny',
        approve: 'Approve',
        openServer: 'Open server settings',
        brand: 'Aha',
        teamAgent1: 'Architect',
        teamAgent1Task: 'System design & task distribution',
        teamAgent1Machine: 'Mac Studio',
        teamAgent2: 'Builder',
        teamAgent2Task: 'Auth module + API endpoints',
        teamAgent2Machine: 'Linux Server',
        teamAgent3: 'QA',
        teamAgent3Task: 'E2E tests & integration tests',
        teamAgent3Machine: 'Windows PC',
        teamAgent4: 'DevOps',
        teamAgent4Task: 'CI/CD pipeline & deployment',
        teamAgent4Machine: 'GPU Cloud',
        cliCommand: 'npm i -g cc-aha-cli-v3@latest && aha-v3 auth login --force',
        activeCount: ({ count }: { count: number }) => `${count} active`,
        cliCopiedTitle: 'Copied',
        cliCopiedMessage: 'Command copied to clipboard. Paste it in your terminal to get started.',
        previewAgentCount: ({ count }: { count: number }) => `${count} agents`,
        agentStatusTesting: 'testing',
        agentStatusDeploying: 'deploying',
    },
} as const;

export type Translations = typeof en;

/**
 * Generic translation type that matches the structure of Translations
 * but allows different string values (for other languages)
 */
export type TranslationStructure = {
    readonly [K in keyof Translations]: {
        readonly [P in keyof Translations[K]]: Translations[K][P] extends string
        ? string
        : Translations[K][P] extends (...args: any[]) => string
        ? Translations[K][P]
        : Translations[K][P] extends readonly string[]
        ? readonly string[]
        : Translations[K][P] extends object
        ? {
            readonly [Q in keyof Translations[K][P]]: Translations[K][P][Q] extends string
            ? string
            : Translations[K][P][Q] extends readonly string[]
            ? readonly string[]
            : Translations[K][P][Q] extends object
            ? {
                readonly [R in keyof Translations[K][P][Q]]: Translations[K][P][Q][R] extends string
                ? string
                : Translations[K][P][Q][R] extends readonly string[]
                ? readonly string[]
                : Translations[K][P][Q][R]
            }
            : Translations[K][P][Q]
        }
        : Translations[K][P]
    }
};
