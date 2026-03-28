import React, { useState } from 'react';
import {
    View,
    Text,
    Pressable,
    ScrollView,
    TextInput,
    Modal,
    ActivityIndicator,
    Platform,
    KeyboardAvoidingView
} from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Ionicons } from '@expo/vector-icons';
import { KanbanTask, KanbanColumn, TaskComment, TaskCommentType } from '@/sync/kanbanTypes';
import { MarkdownView } from '@/components/markdown/MarkdownView';
import { trackTaskFeedback } from '@/track';

interface TaskDetailModalProps {
    visible: boolean;
    task: KanbanTask | null;
    columns: KanbanColumn[];
    onClose: () => void;
    onSave?: (taskId: string, updates: Partial<KanbanTask>) => Promise<void>;
    onAddComment?: (taskId: string, comment: TaskComment) => Promise<void>;
    onDelete?: (taskId: string) => Promise<void>;
    onDiscuss?: (task: KanbanTask) => void;
    allSessions?: any[];
    actorSessionId?: string;
    actorRole?: string;
    actorDisplayName?: string;
    /** When true, renders as an absolute overlay within its parent instead of a system Modal. */
    contained?: boolean;
}

interface Subtask {
    id: string;
    title: string;
    done: boolean;
}

const COMMENT_TYPE_OPTIONS: Array<{
    type: TaskCommentType;
    label: string;
    icon: string;
    placeholder: string;
}> = [
    { type: 'note', label: 'Note', icon: 'document-text-outline', placeholder: 'Add context, rationale, or notes...' },
    { type: 'plan', label: 'Plan', icon: 'bulb-outline', placeholder: 'Post your proposed approach before implementation...' },
    { type: 'plan-review', label: 'Plan Review', icon: 'git-compare-outline', placeholder: 'Review the proposed plan before execution...' },
    { type: 'execution-check', label: 'Execution Check', icon: 'checkbox-outline', placeholder: 'Check completed plan items and add verification...' },
    { type: 'rework-request', label: 'Rework', icon: 'refresh-outline', placeholder: 'Send work back with precise required fixes...' },
];

const CHECKLIST_LINE_REGEX = /^[-*]\s+\[([ xX])\]\s+(.+)$/;

export function getCommentTypeLabel(type?: string): string {
    switch (type) {
        case 'plan': return 'Plan';
        case 'plan-review': return 'Plan Review';
        case 'execution-check': return 'Execution Check';
        case 'rework-request': return 'Rework';
        case 'review-feedback': return 'Review Feedback';
        case 'status-change': return 'Status Change';
        case 'handoff': return 'Handoff';
        case 'blocker': return 'Blocker';
        case 'decision': return 'Decision';
        case 'human-override': return 'Human Override';
        default: return 'Note';
    }
}

export function extractChecklistItems(content?: string): string[] {
    if (!content) return [];
    return content
        .split('\n')
        .map((line) => line.trim())
        .map((line) => line.match(CHECKLIST_LINE_REGEX))
        .filter((match): match is RegExpMatchArray => Boolean(match))
        .map((match) => match[2].trim());
}

export function parseCommentBody(content: string): { prose: string; checklist: Array<{ text: string; completed: boolean }> } {
    const prose: string[] = [];
    const checklist: Array<{ text: string; completed: boolean }> = [];

    content.split('\n').forEach((line) => {
        const match = line.trim().match(CHECKLIST_LINE_REGEX);
        if (match) {
            checklist.push({
                text: match[2].trim(),
                completed: match[1].toLowerCase() === 'x',
            });
            return;
        }
        prose.push(line);
    });

    return {
        prose: prose.join('\n').trim(),
        checklist,
    };
}

export function buildCommentTemplate(type: TaskCommentType, planSource?: string): string {
    const planItems = extractChecklistItems(planSource);

    switch (type) {
        case 'plan':
            return [
                '## Proposed approach',
                '- Briefly describe the intended solution and scope.',
                '',
                '## Checklist',
                '- [ ] Confirm scope and affected files',
                '- [ ] Implement the change',
                '- [ ] Verify with tests / manual checks',
                '',
                '## Risks / open questions',
                '- None yet.',
            ].join('\n');
        case 'plan-review':
            return [
                '## Plan review',
                '- What looks good:',
                '- Blocking concerns:',
                '- Suggested changes before execution:',
            ].join('\n');
        case 'execution-check':
            return [
                '## Execution check against plan',
                ...(planItems.length > 0
                    ? planItems.map((item) => `- [ ] ${item}`)
                    : ['- [ ] Planned item 1', '- [ ] Planned item 2']),
                '',
                '## Evidence / verification',
                '- Tests run:',
                '- Manual checks:',
            ].join('\n');
        case 'rework-request':
            return [
                '## Rework requested',
                '- [ ] Item that still needs to be fixed',
                '- [ ] Extra verification required before merge',
                '',
                '## Why this is being sent back',
                '- Explain the gap against the agreed plan.',
            ].join('\n');
        default:
            return '';
    }
}

export const TaskDetailModal: React.FC<TaskDetailModalProps> = ({
    visible,
    task,
    columns,
    onClose,
    onSave,
    onAddComment,
    onDelete,
    onDiscuss,
    allSessions,
    actorSessionId,
    actorRole,
    actorDisplayName,
    contained = false,
}) => {
    const { theme } = useUnistyles();
    const [isEditing, setIsEditing] = useState(false);
    const [editedTask, setEditedTask] = useState<Partial<KanbanTask>>({});
    const [subtasks, setSubtasks] = useState<Subtask[]>([]);
    const [isSaving, setIsSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [feedbackGiven, setFeedbackGiven] = useState<1 | -1 | null>(null);
    const [commentDraft, setCommentDraft] = useState('');
    const [selectedCommentType, setSelectedCommentType] = useState<TaskCommentType>('note');

    // 当 task 改变时,重置状态
    React.useEffect(() => {
        if (task) {
            setSaveError(null);
            setFeedbackGiven(null);
            setCommentDraft('');
            setSelectedCommentType('note');
            setEditedTask({
                title: task.title,
                description: task.description || '',
                status: task.status,
                assigneeId: task.assigneeId,
                priority: task.priority || 'medium',
                dueDate: task.dueDate,
                tags: task.tags || []
            });
            // TODO: 从 subtaskIds 加载子任务
            setSubtasks([]);
        }
    }, [task]);

    React.useEffect(() => {
        if (!visible) {
            setSaveError(null);
        }
    }, [visible]);

    // Reset edit mode when task changes
    React.useEffect(() => {
        setIsEditing(false);
    }, [task?.id]);

    const getAssigneeName = (assigneeId?: string | null) => {
        if (!assigneeId) return 'Unassigned';
        const session = allSessions?.find(s => s.id === assigneeId);
        return session?.displayName || session?.name || assigneeId;
    };

    const getPriorityColor = (priority?: string) => {
        switch (priority) {
            case 'urgent': return theme.colors.textDestructive;
            case 'high': return theme.colors.warning;
            case 'medium': return theme.colors.textLink;
            case 'low': return theme.colors.success;
            default: return theme.colors.textSecondary;
        }
    };

    const formatDate = (timestamp?: number) => {
        if (!timestamp) return 'No due date';
        return new Date(timestamp).toLocaleDateString();
    };

    const formatCommentDate = (timestamp: number) => {
        try {
            return new Date(timestamp).toLocaleString();
        } catch {
            return '';
        }
    };

    const buildTaskComment = (content: string, type: TaskComment['type'] = 'note'): TaskComment => {
        return {
            id: `comment-${Date.now()}`,
            authorSessionId: actorSessionId || 'unknown-session',
            authorRole: actorRole || 'user',
            authorDisplayName: actorDisplayName || 'Unknown',
            type,
            content: content.trim(),
            createdAt: Date.now(),
        };
    };

    const commentSuggestedForTransition = !!task && isEditing && (
        (task.status === 'review' && (editedTask.status || task.status) === 'in-progress')
        || (task.status === 'done' && (editedTask.status || task.status) === 'in-progress')
    );
    const latestPlanComment = [...(task?.comments || [])]
        .filter((comment) => comment.type === 'plan')
        .sort((left, right) => right.createdAt - left.createdAt)[0];
    const hasPlanComment = Boolean(latestPlanComment);

    // Early return AFTER all hooks to avoid "Rendered fewer/more hooks" error
    if (!task) return null;

    const humanLockMessage = task.humanStatusLock
        ? (() => {
            const lockedBy = task.humanStatusLock.lockedByDisplayName || task.humanStatusLock.lockedBySessionId || 'A human';
            if (task.humanStatusLock.mode === 'manual-status') {
                return `${lockedBy} manually locked this task after a status change. Agents should not overwrite it until the lock is cleared.`;
            }
            if (task.humanStatusLock.mode === 'editing') {
                return `${lockedBy} is actively editing this task.`;
            }
            return `${lockedBy} is actively viewing this task.`;
        })()
        : null;

    const handleSave = async () => {
        if (!onSave) return;

        setIsSaving(true);
        setSaveError(null);
        try {
            const updates: Partial<KanbanTask> = { ...editedTask };
            if (commentDraft.trim()) {
                const draftType = selectedCommentType === 'note' && commentSuggestedForTransition
                    ? 'review-feedback'
                    : selectedCommentType;
                updates.comments = [...(task.comments || []), buildTaskComment(
                    commentDraft,
                    draftType,
                )];
            }

            await onSave(task.id, updates);
            setIsEditing(false);
            setSaveError(null);
            setCommentDraft('');
            setSelectedCommentType('note');
        } catch (error) {
            console.error('Failed to save task:', error);
            setSaveError(error instanceof Error ? error.message : 'Failed to save task');
        } finally {
            setIsSaving(false);
        }
    };

    const handleCancel = () => {
        setIsEditing(false);
        setSaveError(null);
        // 重置为原始值
        setEditedTask({
            title: task.title,
            description: task.description || '',
            status: task.status,
            assigneeId: task.assigneeId,
            priority: task.priority || 'medium',
            dueDate: task.dueDate,
            tags: task.tags || []
        });
        setCommentDraft('');
        setSelectedCommentType('note');
    };

    const handleAddComment = async () => {
        if (!commentDraft.trim()) return;

        const comment = buildTaskComment(commentDraft, selectedCommentType);
        setIsSaving(true);
        setSaveError(null);
        try {
            if (onAddComment) {
                await onAddComment(task.id, comment);
            } else if (onSave) {
                await onSave(task.id, {
                    comments: [...(task.comments || []), comment],
                });
            }
            setCommentDraft('');
            setSelectedCommentType('note');
        } catch (error) {
            console.error('Failed to add task comment:', error);
            setSaveError(error instanceof Error ? error.message : 'Failed to add task comment');
        } finally {
            setIsSaving(false);
        }
    };

    const handleInsertCommentTemplate = () => {
        const template = buildCommentTemplate(selectedCommentType, latestPlanComment?.content);
        if (!template) {
            return;
        }
        setCommentDraft((previous) => previous.trim().length > 0 ? `${previous.trim()}\n\n${template}` : template);
    };

    const subtasksDone = subtasks.filter(s => s.done).length;
    const subtasksProgress = subtasks.length > 0
        ? `${subtasksDone}/${subtasks.length}`
        : null;

    // Handler for status selection
    const handleStatusPress = () => {
        if (!isEditing || !columns) return;
        const columnIds = columns.map((column) => column.id);
        if (columnIds.length === 0) return;

        const currentStatus = editedTask.status || task.status || columnIds[0];
        const currentIndex = Math.max(0, columnIds.indexOf(currentStatus));
        const nextStatus = columnIds[(currentIndex + 1) % columnIds.length];
        setEditedTask((previous) => ({ ...previous, status: nextStatus }));
    };

    // Handler for priority selection
    const handlePriorityPress = () => {
        if (!isEditing) return;
        const priorities: NonNullable<KanbanTask['priority']>[] = ['low', 'medium', 'high', 'urgent'];
        const currentPriority = editedTask.priority || task.priority || 'medium';
        const currentIndex = Math.max(0, priorities.indexOf(currentPriority));
        const nextPriority = priorities[(currentIndex + 1) % priorities.length];
        setEditedTask((previous) => ({ ...previous, priority: nextPriority }));
    };

    // Handler for subtask toggle
    const handleSubtaskToggle = (subtaskId: string) => {
        setSubtasks(prev => prev.map(st =>
            st.id === subtaskId ? { ...st, done: !st.done } : st
        ));
    };

    // Handler for adding subtask
    const handleAddSubtask = () => {
        // Subtask creation not yet implemented
    };

    const handleDelete = async () => {
        if (!onDelete || !task) return;
        setIsSaving(true);
        setSaveError(null);
        try {
            await onDelete(task.id);
        } catch (error) {
            console.error('Failed to delete task:', error);
            setSaveError(error instanceof Error ? error.message : 'Failed to delete task');
        } finally {
            setIsSaving(false);
        }
    };

    const overlayStyle = contained ? stylesheet.overlayContained : stylesheet.overlay;

    const body = (
        <View style={overlayStyle}>
            <View style={stylesheet.container}>
                {/* Header */}
                <View style={stylesheet.header}>
                    <Text style={stylesheet.headerTitle}>
                        {isEditing ? 'Edit Task' : 'Task Details'}
                    </Text>
                    <Pressable onPress={onClose} style={stylesheet.closeButton}>
                        <Ionicons name="close" size={24} color={theme.colors.text} />
                    </Pressable>
                </View>

                {saveError && (
                    <View style={stylesheet.errorBanner}>
                        <Text style={stylesheet.errorText}>{saveError}</Text>
                    </View>
                )}
                {humanLockMessage ? (
                    <View style={stylesheet.lockBanner}>
                        <Ionicons name="hand-left-outline" size={16} color={theme.colors.warning} />
                        <Text style={stylesheet.lockBannerText}>{humanLockMessage}</Text>
                    </View>
                ) : null}

                <ScrollView style={stylesheet.content} showsVerticalScrollIndicator={false}>
                    {/* Title */}
                    {isEditing ? (
                        <TextInput
                            style={stylesheet.titleInput}
                            value={editedTask.title}
                            onChangeText={(text) => setEditedTask((previous) => ({ ...previous, title: text }))}
                            placeholder="Task title"
                        />
                    ) : (
                        <Text style={stylesheet.title}>{task.title}</Text>
                    )}

                            {/* Status & Assignee */}
                            <View style={stylesheet.metaRow}>
                                <View style={stylesheet.metaItem}>
                                    <Text style={stylesheet.metaLabel}>Status</Text>
                                    {isEditing ? (
                                        <Pressable style={stylesheet.selectButton} onPress={handleStatusPress}>
                                            <Text style={stylesheet.selectText}>
                                                {columns.find(c => c.id === editedTask.status)?.title || editedTask.status}
                                            </Text>
                                            <Ionicons name="chevron-down" size={16} color={theme.colors.textSecondary} />
                                        </Pressable>
                                    ) : (
                                        <Text style={stylesheet.metaValue}>
                                            {columns.find(c => c.id === task.status)?.title || task.status}
                                        </Text>
                                    )}
                                </View>

                                <View style={stylesheet.metaItem}>
                                    <Text style={stylesheet.metaLabel}>Assignee</Text>
                                    <Text style={stylesheet.metaValue}>
                                        {getAssigneeName(task.assigneeId)}
                                    </Text>
                                </View>
                                <View style={stylesheet.metaItem}>
                                    <Text style={stylesheet.metaLabel}>Reporter</Text>
                                    <Text style={stylesheet.metaValue}>
                                        {getAssigneeName(task.reporterId)}
                                    </Text>
                                </View>
                            </View>

                            {/* Priority */}
                            <View style={stylesheet.metaRow}>
                                <View style={stylesheet.metaItem}>
                                    <Text style={stylesheet.metaLabel}>Priority</Text>
                                    {isEditing ? (
                                        <Pressable style={stylesheet.selectButton} onPress={handlePriorityPress}>
                                            <Text style={[
                                                stylesheet.metaValue,
                                                { color: getPriorityColor(editedTask.priority) }
                                            ]}>
                                                {editedTask.priority?.toUpperCase()}
                                            </Text>
                                            <Ionicons name="chevron-down" size={16} color={theme.colors.textSecondary} />
                                        </Pressable>
                                    ) : (
                                        <Text style={[
                                            stylesheet.metaValue,
                                            { color: getPriorityColor(task.priority) }
                                        ]}>
                                            {task.priority?.toUpperCase() || 'MEDIUM'}
                                        </Text>
                                    )}
                                </View>

                                <View style={stylesheet.metaItem}>
                                    <Text style={stylesheet.metaLabel}>Due Date</Text>
                                    <Text style={stylesheet.metaValue}>
                                        {formatDate(task.dueDate)}
                                    </Text>
                                </View>
                            </View>

                            {/* Description */}
                            <View style={stylesheet.section}>
                                <Text style={stylesheet.sectionTitle}>Description</Text>
                                {isEditing ? (
                                    <TextInput
                                        style={stylesheet.descriptionInput}
                                        value={editedTask.description}
                                        onChangeText={(text) => setEditedTask((previous) => ({ ...previous, description: text }))}
                                        placeholder="Add a description..."
                                        multiline
                                        numberOfLines={4}
                                    />
                                ) : (
                                    task.description ? (
                                        <View style={stylesheet.markdownBlock}>
                                            <MarkdownView markdown={task.description} textColor={theme.colors.text} />
                                        </View>
                                    ) : (
                                        <Text style={stylesheet.description}>
                                            No description
                                        </Text>
                                    )
                                )}
                            </View>

                            {/* Subtasks */}
                            {subtasks.length > 0 && (
                                <View style={stylesheet.section}>
                                    <View style={stylesheet.sectionHeader}>
                                        <Text style={stylesheet.sectionTitle}>Subtasks</Text>
                                        {subtasksProgress && (
                                            <Text style={stylesheet.progress}>{subtasksProgress} done</Text>
                                        )}
                                    </View>
                                    {subtasks.map((subtask) => (
                                        <Pressable
                                            key={subtask.id}
                                            style={stylesheet.subtaskRow}
                                            onPress={() => handleSubtaskToggle(subtask.id)}
                                        >
                                            <Ionicons
                                                name={subtask.done ? "checkbox" : "square-outline"}
                                                size={20}
                                                color={subtask.done ? theme.colors.success : theme.colors.textSecondary}
                                            />
                                            <Text style={[
                                                stylesheet.subtaskTitle,
                                                subtask.done && stylesheet.subtaskDone
                                            ]}>
                                                {subtask.title}
                                            </Text>
                                        </Pressable>
                                    ))}
                                    <Pressable style={stylesheet.addSubtaskButton} onPress={handleAddSubtask}>
                                        <Ionicons name="add" size={16} color={theme.colors.textSecondary} />
                                        <Text style={stylesheet.addSubtaskText}>Add subtask</Text>
                                    </Pressable>
                                </View>
                            )}

                            {/* Tags */}
                            {task.tags && task.tags.length > 0 && (
                                <View style={stylesheet.section}>
                                    <Text style={stylesheet.sectionTitle}>Tags</Text>
                                    <View style={stylesheet.tagsContainer}>
                                        {task.tags.map((tag, index) => (
                                            <View key={index} style={stylesheet.tag}>
                                                <Text style={stylesheet.tagText}>{tag}</Text>
                                            </View>
                                        ))}
                                    </View>
                                </View>
                            )}

                            {/* Comments / Task Memory */}
                            <View style={stylesheet.section}>
                                <View style={stylesheet.sectionHeader}>
                                    <Text style={stylesheet.sectionTitle}>Comments</Text>
                                    <Text style={stylesheet.progress}>{task.comments?.length || 0}</Text>
                                </View>
                                {!hasPlanComment && ['todo', 'in-progress', 'review'].includes(task.status) ? (
                                    <Text style={stylesheet.commentRequiredText}>
                                        Missing a plan comment. Before execution, add a type=Plan comment with the proposed approach and a checklist.
                                    </Text>
                                ) : null}
                                {task.comments && task.comments.length > 0 ? (
                                    <View style={stylesheet.commentsList}>
                                        {[...task.comments]
                                            .sort((left, right) => left.createdAt - right.createdAt)
                                            .map((comment) => {
                                                const parsedBody = parseCommentBody(comment.content);
                                                const checklistProgress = parsedBody.checklist.length > 0
                                                    ? `${parsedBody.checklist.filter((item) => item.completed).length}/${parsedBody.checklist.length} checked`
                                                    : null;

                                                return (
                                                <View key={comment.id} style={stylesheet.commentCard}>
                                                    <View style={stylesheet.commentHeader}>
                                                        <Text style={stylesheet.commentAuthor}>
                                                            {(comment as any).authorDisplayName || (comment as any).displayName || (comment as any).authorRole || (comment as any).authorSessionId || (comment as any).sessionId || 'Unknown'}
                                                        </Text>
                                                        <Text style={stylesheet.commentMeta}>
                                                            {[comment.authorRole, formatCommentDate(comment.createdAt)].filter(Boolean).join(' · ')}
                                                        </Text>
                                                    </View>
                                                    <View style={stylesheet.commentTypeRow}>
                                                        <View style={stylesheet.commentTypeBadge}>
                                                            <Text style={stylesheet.commentTypeText}>{getCommentTypeLabel((comment as any).type)}</Text>
                                                        </View>
                                                        {checklistProgress ? (
                                                            <Text style={stylesheet.commentChecklistProgress}>{checklistProgress}</Text>
                                                        ) : null}
                                                    </View>
                                                    {parsedBody.prose ? (
                                                        <View style={stylesheet.markdownBlock}>
                                                            <MarkdownView markdown={parsedBody.prose} textColor={theme.colors.text} />
                                                        </View>
                                                    ) : null}
                                                    {parsedBody.checklist.length > 0 ? (
                                                        <View style={stylesheet.commentChecklist}>
                                                            {parsedBody.checklist.map((item, index) => (
                                                                <View key={`${comment.id}-${index}`} style={stylesheet.commentChecklistItem}>
                                                                    <Ionicons
                                                                        name={item.completed ? 'checkbox' : 'square-outline'}
                                                                        size={16}
                                                                        color={item.completed ? theme.colors.success : theme.colors.textSecondary}
                                                                    />
                                                                    <Text
                                                                        style={[
                                                                            stylesheet.commentChecklistText,
                                                                            item.completed && stylesheet.commentChecklistTextDone,
                                                                        ]}
                                                                    >
                                                                        {item.text}
                                                                    </Text>
                                                                </View>
                                                            ))}
                                                        </View>
                                                    ) : null}
                                                </View>
                                            )})}
                                    </View>
                                ) : (
                                    <Text style={stylesheet.noActivity}>No comments yet</Text>
                                )}

                                <View style={stylesheet.commentTypePicker}>
                                    {COMMENT_TYPE_OPTIONS.map((option) => {
                                        const isActive = selectedCommentType === option.type;
                                        return (
                                            <Pressable
                                                key={option.type}
                                                onPress={() => setSelectedCommentType(option.type)}
                                                style={[
                                                    stylesheet.commentTypeChip,
                                                    isActive && stylesheet.commentTypeChipActive,
                                                ]}
                                            >
                                                <Ionicons
                                                    name={option.icon as any}
                                                    size={14}
                                                    color={isActive ? theme.colors.button.primary.tint : theme.colors.textSecondary}
                                                />
                                                <Text
                                                    style={[
                                                        stylesheet.commentTypeChipText,
                                                        isActive && stylesheet.commentTypeChipTextActive,
                                                    ]}
                                                >
                                                    {option.label}
                                                </Text>
                                            </Pressable>
                                        );
                                    })}
                                </View>

                                <TextInput
                                    style={stylesheet.descriptionInput}
                                    value={commentDraft}
                                    onChangeText={setCommentDraft}
                                    placeholder={COMMENT_TYPE_OPTIONS.find((option) => option.type === selectedCommentType)?.placeholder || 'Add a comment to this task...'}
                                    multiline
                                    numberOfLines={3}
                                />
                                {selectedCommentType !== 'note' ? (
                                    <Pressable style={stylesheet.templateButton} onPress={handleInsertCommentTemplate}>
                                        <Ionicons name="sparkles-outline" size={16} color={theme.colors.textSecondary} />
                                        <Text style={stylesheet.templateButtonText}>
                                            Insert {getCommentTypeLabel(selectedCommentType).toLowerCase()} template
                                        </Text>
                                    </Pressable>
                                ) : null}
                                {commentSuggestedForTransition ? (
                                    <Text style={stylesheet.commentRequiredText}>
                                        Suggested: leave a comment here so the next agent inherits the review / rework context.
                                    </Text>
                                ) : null}
                                {!isEditing ? (
                                    <Pressable
                                        style={[stylesheet.addSubtaskButton, !commentDraft.trim() && { opacity: 0.5 }]}
                                        onPress={handleAddComment}
                                        disabled={!commentDraft.trim() || isSaving}
                                    >
                                        <Ionicons name="chatbubble-ellipses-outline" size={16} color={theme.colors.textSecondary} />
                                        <Text style={stylesheet.addSubtaskText}>Add comment</Text>
                                    </Pressable>
                                ) : null}
                            </View>

                            {/* Feedback — shown only for done tasks */}
                            {task.status === 'done' && !isEditing && (
                                <View style={[stylesheet.section, { alignItems: 'center', paddingVertical: 12 }]}>
                                    {feedbackGiven === null ? (
                                        <>
                                            <Text style={[stylesheet.sectionTitle, { marginBottom: 10 }]}>
                                                How did AI do on this task?
                                            </Text>
                                            <View style={{ flexDirection: 'row', gap: 20 }}>
                                                <Pressable
                                                    onPress={() => {
                                                        setFeedbackGiven(1);
                                                        trackTaskFeedback(task.id, 1);
                                                    }}
                                                    style={{ padding: 8 }}
                                                >
                                                    <Ionicons name="thumbs-up" size={28} color={theme.colors.success} />
                                                </Pressable>
                                                <Pressable
                                                    onPress={() => {
                                                        setFeedbackGiven(-1);
                                                        trackTaskFeedback(task.id, -1);
                                                    }}
                                                    style={{ padding: 8 }}
                                                >
                                                    <Ionicons name="thumbs-down" size={28} color={theme.colors.textSecondary} />
                                                </Pressable>
                                            </View>
                                        </>
                                    ) : (
                                        <Text style={{ color: theme.colors.textSecondary, fontSize: 14 }}>
                                            {feedbackGiven === 1 ? 'Thanks for the feedback!' : 'Got it, we\'ll improve.'}
                                        </Text>
                                    )}
                                </View>
                            )}
                        </ScrollView>

                        {/* Footer Actions */}
                        <View style={stylesheet.footer}>
                            {!isEditing ? (
                                <>
                                    <Pressable
                                        style={[stylesheet.footerButton, stylesheet.discussButton]}
                                        onPress={() => onDiscuss?.(task)}
                                    >
                                        <Ionicons name="chatbubbles" size={18} color="#FFF" />
                                        <Text style={stylesheet.footerButtonText}>Discuss</Text>
                                    </Pressable>
                                    <Pressable
                                        style={[stylesheet.footerButton, stylesheet.editButton]}
                                        onPress={() => setIsEditing(true)}
                                    >
                                        <Ionicons name="create" size={18} color="#FFF" />
                                        <Text style={stylesheet.footerButtonText}>Edit</Text>
                                    </Pressable>
                                    {onDelete ? (
                                        <Pressable
                                            style={[stylesheet.footerButton, stylesheet.deleteButton]}
                                            onPress={handleDelete}
                                            disabled={isSaving}
                                        >
                                            {isSaving ? (
                                                <ActivityIndicator size="small" color="#FFF" />
                                            ) : (
                                                <>
                                                    <Ionicons name="trash" size={18} color="#FFF" />
                                                    <Text style={stylesheet.footerButtonText}>Delete</Text>
                                                </>
                                            )}
                                        </Pressable>
                                    ) : null}
                                </>
                            ) : (
                                <>
                                    <Pressable
                                        style={[stylesheet.footerButton, stylesheet.cancelButton]}
                                        onPress={handleCancel}
                                        disabled={isSaving}
                                    >
                                        <Text style={[stylesheet.footerButtonText, stylesheet.cancelButtonText]}>Cancel</Text>
                                    </Pressable>
                                    <Pressable
                                        style={[stylesheet.footerButton, stylesheet.saveButton]}
                                        onPress={handleSave}
                                        disabled={isSaving}
                                    >
                                        {isSaving ? (
                                            <ActivityIndicator size="small" color="#FFF" />
                                        ) : (
                                            <>
                                                <Ionicons name="checkmark" size={18} color="#FFF" />
                                                <Text style={stylesheet.footerButtonText}>Save</Text>
                                            </>
                                        )}
                                    </Pressable>
                                </>
                            )}
                        </View>
                    </View>
                </View>
    );

    if (contained) {
        if (!visible) return null;
        return body;
    }

    return (
        <Modal
            visible={visible}
            animationType="slide"
            transparent={true}
            onRequestClose={onClose}
        >
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={{ flex: 1 }}
            >
                {body}
            </KeyboardAvoidingView>
        </Modal>
    );
};

const stylesheet = StyleSheet.create((theme) => ({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 16,
    },
    overlayContained: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.4)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
        zIndex: 100,
    },
    container: {
        backgroundColor: theme.colors.surface,
        borderRadius: 16,
        width: '100%',
        maxWidth: 600,
        maxHeight: '90%',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.divider,
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: theme.colors.text,
    },
    closeButton: {
        padding: 4,
    },
    content: {
        padding: 16,
        maxHeight: '70%',
    },
    title: {
        fontSize: 20,
        fontWeight: 'bold',
        color: theme.colors.text,
        marginBottom: 16,
    },
    titleInput: {
        fontSize: 20,
        fontWeight: 'bold',
        color: theme.colors.text,
        marginBottom: 16,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.divider,
        paddingVertical: 8,
    },
    metaRow: {
        flexDirection: 'row',
        marginBottom: 16,
        gap: 16,
    },
    metaItem: {
        flex: 1,
    },
    metaLabel: {
        fontSize: 12,
        color: theme.colors.textSecondary,
        marginBottom: 4,
    },
    metaValue: {
        fontSize: 14,
        color: theme.colors.text,
        fontWeight: '500',
    },
    selectButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: theme.colors.groupped.background,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 8,
    },
    selectText: {
        fontSize: 14,
        color: theme.colors.text,
    },
    section: {
        marginBottom: 24,
    },
    sectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: theme.colors.text,
        marginBottom: 8,
    },
    progress: {
        fontSize: 12,
        color: theme.colors.textSecondary,
    },
    description: {
        fontSize: 14,
        color: theme.colors.text,
        lineHeight: 20,
    },
    markdownBlock: {
        width: '100%',
    },
    descriptionInput: {
        fontSize: 14,
        color: theme.colors.text,
        lineHeight: 20,
        backgroundColor: theme.colors.groupped.background,
        borderRadius: 8,
        padding: 12,
        textAlignVertical: 'top',
    },
    noActivity: {
        fontSize: 14,
        color: theme.colors.textSecondary,
        fontStyle: 'italic',
    },
    commentsList: {
        gap: 10,
        marginBottom: 12,
    },
    commentCard: {
        backgroundColor: theme.colors.groupped.background,
        borderRadius: 10,
        padding: 12,
        gap: 6,
    },
    commentHeader: {
        gap: 2,
    },
    commentAuthor: {
        fontSize: 13,
        fontWeight: '600',
        color: theme.colors.text,
    },
    commentMeta: {
        fontSize: 11,
        color: theme.colors.textSecondary,
    },
    commentTypeBadge: {
        alignSelf: 'flex-start',
        backgroundColor: `${theme.colors.textLink}15`,
        borderRadius: 999,
        paddingHorizontal: 8,
        paddingVertical: 4,
    },
    commentTypeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
    },
    commentTypeText: {
        fontSize: 10,
        fontWeight: '700',
        color: theme.colors.textLink,
    },
    commentChecklistProgress: {
        fontSize: 11,
        color: theme.colors.textSecondary,
    },
    commentChecklist: {
        gap: 6,
        marginTop: 4,
    },
    commentChecklistItem: {
        flexDirection: 'row',
        gap: 8,
        alignItems: 'flex-start',
    },
    commentChecklistText: {
        flex: 1,
        fontSize: 13,
        lineHeight: 18,
        color: theme.colors.text,
    },
    commentChecklistTextDone: {
        textDecorationLine: 'line-through',
        color: theme.colors.textSecondary,
    },
    commentRequiredText: {
        fontSize: 12,
        color: theme.colors.warning,
        marginTop: 8,
    },
    commentTypePicker: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginTop: 12,
        marginBottom: 8,
    },
    commentTypeChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 10,
        paddingVertical: 7,
        borderRadius: 999,
        backgroundColor: theme.colors.groupped.background,
        borderWidth: 1,
        borderColor: theme.colors.divider,
    },
    commentTypeChipActive: {
        backgroundColor: `${theme.colors.textLink}12`,
        borderColor: `${theme.colors.textLink}45`,
    },
    commentTypeChipText: {
        fontSize: 12,
        color: theme.colors.textSecondary,
        fontWeight: '500',
    },
    commentTypeChipTextActive: {
        color: theme.colors.textLink,
        fontWeight: '600',
    },
    templateButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginTop: 8,
        paddingVertical: 8,
    },
    templateButtonText: {
        fontSize: 13,
        color: theme.colors.textSecondary,
    },
    subtaskRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
        gap: 12,
    },
    subtaskTitle: {
        fontSize: 14,
        color: theme.colors.text,
        flex: 1,
    },
    subtaskDone: {
        textDecorationLine: 'line-through',
        color: theme.colors.textSecondary,
    },
    addSubtaskButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginTop: 8,
        paddingVertical: 8,
    },
    addSubtaskText: {
        fontSize: 14,
        color: theme.colors.textSecondary,
    },
    tagsContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    tag: {
        backgroundColor: theme.colors.groupped.background,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 12,
    },
    tagText: {
        fontSize: 12,
        color: theme.colors.text,
    },
    footer: {
        flexDirection: 'row',
        padding: 16,
        borderTopWidth: 1,
        borderTopColor: theme.colors.divider,
        gap: 12,
    },
    footerButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 12,
        borderRadius: 8,
    },
    footerButtonText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#FFF',
    },
    cancelButtonText: {
        color: theme.colors.text,
    },
    discussButton: {
        backgroundColor: theme.colors.textLink,
    },
    editButton: {
        backgroundColor: theme.colors.button.primary.background,
    },
    deleteButton: {
        backgroundColor: theme.colors.textDestructive,
    },
    cancelButton: {
        backgroundColor: theme.colors.groupped.background,
    },
    saveButton: {
        backgroundColor: theme.colors.success,
    },
    errorBanner: {
        marginHorizontal: 16,
        marginTop: 12,
        padding: 12,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: theme.colors.textDestructive,
        backgroundColor: theme.colors.surfaceHighest,
    },
    errorText: {
        fontSize: 12,
        color: theme.colors.textDestructive,
    },
    lockBanner: {
        flexDirection: 'row',
        gap: 8,
        alignItems: 'flex-start',
        marginHorizontal: 16,
        marginTop: 12,
        padding: 12,
        borderRadius: 10,
        backgroundColor: `${theme.colors.warning}14`,
    },
    lockBannerText: {
        flex: 1,
        fontSize: 12,
        lineHeight: 18,
        color: theme.colors.text,
    },
}));
