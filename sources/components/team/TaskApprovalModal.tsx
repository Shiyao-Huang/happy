import * as React from 'react';
import { View, Text, ScrollView, TextInput, Pressable, Modal, ActivityIndicator } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Ionicons } from '@expo/vector-icons';
import { Typography } from '@/constants/Typography';
import type { KanbanTask } from '@/sync/kanbanTypes';
import {
    taskNeedsApproval,
    approveTask,
    rejectTask,
    reassignTask,
    editTask,
    deleteTask as deleteTaskUtil
} from '@/utils/taskHelpers';
import { sync } from '@/sync/sync';
import { storage, useAllSessions } from '@/sync/storage';
import { getSessionName as resolveSessionName } from '@/utils/sessionUtils';
import { Modal as CustomModal } from '@/modal';
import { useAuth } from '@/auth/AuthContext';

interface TaskApprovalModalProps {
    visible: boolean;
    onClose: () => void;
    pendingTasks: KanbanTask[];
    teamId: string;
    onTaskApproved?: (task: KanbanTask) => void;
    onTaskRejected?: (task: KanbanTask, reason: string) => void;
}

export const TaskApprovalModal: React.FC<TaskApprovalModalProps> = ({
    visible,
    onClose,
    pendingTasks,
    teamId,
    onTaskApproved,
    onTaskRejected
}) => {
    const { theme } = useUnistyles();
    const auth = useAuth();
    const allSessions = useAllSessions();
    const [selectedTaskId, setSelectedTaskId] = React.useState<string | null>(null);
    const [rejectionReason, setRejectionReason] = React.useState('');
    const [processingTaskIds, setProcessingTaskIds] = React.useState<Set<string>>(new Set());
    const isProcessing = processingTaskIds.size > 0;

    const markProcessing = React.useCallback((taskId: string) => {
        setProcessingTaskIds(prev => {
            const next = new Set(prev);
            next.add(taskId);
            return next;
        });
    }, []);

    const clearProcessing = React.useCallback((taskId: string) => {
        setProcessingTaskIds(prev => {
            const next = new Set(prev);
            next.delete(taskId);
            return next;
        });
    }, []);

    const getSessionName = React.useCallback((sessionId?: string | null): string => {
        if (!sessionId) return '';
        const session = allSessions.find(s => s.id === sessionId);
        return session ? resolveSessionName(session) : sessionId.slice(0, 8);
    }, [allSessions]);

    const selectedTask = pendingTasks.find(t => t.id === selectedTaskId);
    const isRejectProcessing = selectedTask ? processingTaskIds.has(selectedTask.id) : false;
    const isRejectDisabled = !rejectionReason.trim() || isRejectProcessing;

    const handleApprove = async (task: KanbanTask) => {
        if (!auth?.credentials) {
            console.error('Not authenticated');
            return;
        }

        markProcessing(task.id);
        try {
            // Get current artifact
            const state = storage.getState();
            const artifact = state.artifacts[teamId];
            if (!artifact?.body) {
                throw new Error('Team artifact not found');
            }

            const teamData = JSON.parse(artifact.body);
            const taskIndex = teamData.tasks.findIndex((t: KanbanTask) => t.id === task.id);

            if (taskIndex === -1) {
                throw new Error('Task not found');
            }

            // Approve the task
            const approvedTask = approveTask(teamData.tasks[taskIndex], 'user');

            // Update the task
            teamData.tasks[taskIndex] = approvedTask;

            // Update artifact
            await sync.updateArtifact(
                teamId,
                artifact.title,
                JSON.stringify(teamData, null, 2),
                artifact.sessions,
                artifact.draft,
                artifact.type
            );

            // Send notification
            await sync.sendTeamMessage({
                teamId,
                fromRole: 'user',
                content: `Task "${task.title}" approved`,
                type: 'task-update',
                metadata: {
                    taskId: task.id,
                    taskChange: {
                        field: 'approvalStatus',
                        oldValue: task.approvalStatus || 'pending',
                        newValue: 'approved'
                    }
                }
            });

            onTaskApproved?.(approvedTask);
            setSelectedTaskId(null);
        } catch (error) {
            console.error('Failed to approve task:', error);
        } finally {
            clearProcessing(task.id);
        }
    };

    const handleReject = async (task: KanbanTask) => {
        if (!rejectionReason.trim()) {
            CustomModal.alert('Rejection Reason Required', 'Please provide a reason for rejection');
            return;
        }

        if (!auth?.credentials) {
            console.error('Not authenticated');
            return;
        }

        markProcessing(task.id);
        try {
            // Get current artifact
            const state = storage.getState();
            const artifact = state.artifacts[teamId];
            if (!artifact?.body) {
                throw new Error('Team artifact not found');
            }

            const teamData = JSON.parse(artifact.body);
            const taskIndex = teamData.tasks.findIndex((t: KanbanTask) => t.id === task.id);

            if (taskIndex === -1) {
                throw new Error('Task not found');
            }

            // Reject and remove the task
            const rejectedTask = rejectTask(
                teamData.tasks[taskIndex],
                'user',
                rejectionReason
            );

            // Remove rejected task from the list (immutable)
            const updatedTeamData = { ...teamData, tasks: teamData.tasks.filter((t: KanbanTask) => t.id !== task.id) };

            // Update artifact
            await sync.updateArtifact(
                teamId,
                artifact.title,
                JSON.stringify(updatedTeamData, null, 2),
                artifact.sessions,
                artifact.draft,
                artifact.type
            );

            // Send notification to AI
            if (task.source === 'ai') {
                await sync.sendTeamMessage({
                    teamId,
                    fromRole: 'user',
                    content: `Task "${task.title}" rejected. Reason: ${rejectionReason}`,
                    type: 'notification',
                    metadata: {
                        taskId: task.id,
                        rejectionReason
                    }
                });
            }

            onTaskRejected?.(rejectedTask, rejectionReason);
            setSelectedTaskId(null);
            setRejectionReason('');
        } catch (error) {
            console.error('Failed to reject task:', error);
        } finally {
            clearProcessing(task.id);
        }
    };

    const handleApproveAll = async () => {
        for (const task of pendingTasks) {
            await handleApprove(task);
        }
    };

    return (
        <Modal
            visible={visible}
            animationType="slide"
            transparent
            onRequestClose={onClose}
        >
            <View style={styles.overlay}>
                <View style={[styles.container, { backgroundColor: theme.colors.surface }]}>
                    {/* Header */}
                    <View style={[styles.header, { borderBottomColor: theme.colors.divider }]}>
                        <Text style={[styles.title, { color: theme.colors.text }]}>
                            Task Approval ({pendingTasks.length})
                        </Text>
                        <Pressable onPress={onClose} style={styles.closeButton}>
                            <Ionicons name="close" size={24} color={theme.colors.text} />
                        </Pressable>
                    </View>

                    {/* Content */}
                    <ScrollView style={styles.content}>
                        {pendingTasks.length === 0 ? (
                            <View style={styles.emptyState}>
                                <Ionicons name="checkmark-circle" size={48} color={theme.colors.success} />
                                <Text style={[styles.emptyStateText, { color: theme.colors.textSecondary }]}>
                                    All tasks approved!
                                </Text>
                            </View>
                        ) : (
                            <>
                                {/* Approve All Button */}
                                <Pressable
                                    onPress={handleApproveAll}
                                    style={[styles.approveAllButton, { backgroundColor: theme.colors.success }]}
                                    disabled={isProcessing}
                                >
                                    <Text style={styles.approveAllButtonText}>
                                        Approve All ({pendingTasks.length})
                                    </Text>
                                </Pressable>

                                {/* Task List */}
                                {pendingTasks.map(task => (
                                    <View
                                        key={task.id}
                                        style={[styles.taskCard, { backgroundColor: theme.colors.surfaceHighest, borderColor: theme.colors.divider }]}
                                    >
                                        {/* Task Header */}
                                        <View style={styles.taskHeader}>
                                            <Text style={[styles.taskTitle, { color: theme.colors.text }]}>
                                                {task.title}
                                            </Text>
                                            {task.priority && (
                                                <View style={[
                                                    styles.priorityBadge,
                                                    task.priority === 'urgent' && styles.priorityUrgent,
                                                    task.priority === 'high' && styles.priorityHigh,
                                                    task.priority === 'medium' && styles.priorityMedium,
                                                    task.priority === 'low' && styles.priorityLow
                                                ]}>
                                                    <Text style={styles.priorityText}>{task.priority}</Text>
                                                </View>
                                            )}
                                        </View>

                                        {/* Proposal Source row */}
                                        <View style={styles.proposalRow}>
                                            {task.source === 'ai' && (
                                                <View style={styles.proposalSourceBadge}>
                                                    <Ionicons name="hardware-chip-outline" size={12} color="#4F46E5" />
                                                    <Text style={styles.proposalSourceText}>AI proposed</Text>
                                                </View>
                                            )}
                                            {task.source === 'user' && (
                                                <View style={[styles.proposalSourceBadge, { backgroundColor: '#D1FAE5' }]}>
                                                    <Ionicons name="person-outline" size={12} color="#065F46" />
                                                    <Text style={[styles.proposalSourceText, { color: '#065F46' }]}>User proposed</Text>
                                                </View>
                                            )}
                                            {task.reporterId && (
                                                <Text style={[styles.metaText, { color: theme.colors.textSecondary, marginLeft: 8 }]}
                                                    numberOfLines={1}>
                                                    by {getSessionName(task.reporterId)}
                                                </Text>
                                            )}
                                            {task.assigneeId && (
                                                <Text style={[styles.metaText, { color: theme.colors.textSecondary, marginLeft: 'auto' }]}
                                                    numberOfLines={1}>
                                                    → {getSessionName(task.assigneeId)}
                                                </Text>
                                            )}
                                        </View>

                                        {/* Intent & Scope */}
                                        {task.description && (
                                            <>
                                                <Text style={[styles.sectionLabel, { color: theme.colors.textSecondary }]}>
                                                    Intent &amp; scope
                                                </Text>
                                                <Text style={[styles.taskDescription, { color: theme.colors.textSecondary }]}>
                                                    {task.description}
                                                </Text>
                                            </>
                                        )}

                                        {/* Impact indicators */}
                                        {((task.dependencies && task.dependencies.length > 0) ||
                                          (task.blocks && task.blocks.length > 0) ||
                                          (task.tags && task.tags.length > 0)) && (
                                            <View style={styles.impactRow}>
                                                {task.dependencies && task.dependencies.length > 0 && (
                                                    <View style={styles.impactChip}>
                                                        <Ionicons name="git-merge-outline" size={11} color={theme.colors.textSecondary} />
                                                        <Text style={[styles.impactChipText, { color: theme.colors.textSecondary }]}>
                                                            {task.dependencies.length} dep{task.dependencies.length > 1 ? 's' : ''}
                                                        </Text>
                                                    </View>
                                                )}
                                                {task.blocks && task.blocks.length > 0 && (
                                                    <View style={[styles.impactChip, { backgroundColor: '#FEF3C7' }]}>
                                                        <Ionicons name="warning-outline" size={11} color="#92400E" />
                                                        <Text style={[styles.impactChipText, { color: '#92400E' }]}>
                                                            unblocks {task.blocks.length}
                                                        </Text>
                                                    </View>
                                                )}
                                                {task.tags && task.tags.map(tag => (
                                                    <View key={tag} style={[styles.impactChip, { backgroundColor: theme.colors.groupped?.background }]}>
                                                        <Text style={[styles.impactChipText, { color: theme.colors.textSecondary }]}>
                                                            #{tag}
                                                        </Text>
                                                    </View>
                                                ))}
                                            </View>
                                        )}

                                        {/* Actions */}
                                        <View style={styles.taskActions}>
                                                <Pressable
                                                    onPress={() => handleApprove(task)}
                                                    style={[styles.actionButton, styles.approveButton, { backgroundColor: theme.colors.success }]}
                                                    disabled={processingTaskIds.has(task.id)}
                                                >
                                                <Ionicons name="checkmark" size={18} color="#FFFFFF" />
                                                <Text style={styles.actionButtonText}>Approve</Text>
                                            </Pressable>

                                                <Pressable
                                                    onPress={() => setSelectedTaskId(task.id)}
                                                    style={[styles.actionButton, styles.rejectButton, { backgroundColor: theme.colors.textDestructive }]}
                                                    disabled={processingTaskIds.has(task.id)}
                                                >
                                                <Ionicons name="close" size={18} color="#FFFFFF" />
                                                <Text style={styles.actionButtonText}>Reject</Text>
                                            </Pressable>
                                        </View>
                                    </View>
                                ))}
                            </>
                        )}
                    </ScrollView>

                    {/* Rejection Reason Modal */}
                    {selectedTask && (
                        <Modal
                            visible={!!selectedTask}
                            animationType="fade"
                            transparent
                            onRequestClose={() => {
                                setSelectedTaskId(null);
                                setRejectionReason('');
                            }}
                        >
                            <View style={styles.overlay}>
                                <View style={[styles.rejectModal, { backgroundColor: theme.colors.surface }]}>
                                    <Text style={[styles.rejectTitle, { color: theme.colors.text }]}>
                                        Reject Task: {selectedTask.title}
                                    </Text>

                                    <Text style={[styles.rejectLabel, { color: theme.colors.text }]}>
                                        Reason for rejection:
                                    </Text>
                                    <TextInput
                                        style={[styles.rejectInput, { backgroundColor: theme.colors.surfaceHighest, borderColor: theme.colors.divider, color: theme.colors.text }]}
                                        placeholder="Why are you rejecting this task?"
                                        placeholderTextColor={theme.colors.textSecondary}
                                        value={rejectionReason}
                                        onChangeText={setRejectionReason}
                                        multiline
                                        numberOfLines={4}
                                        autoFocus
                                    />

                                    <View style={styles.rejectActions}>
                                        <Pressable
                                            onPress={() => {
                                                setSelectedTaskId(null);
                                                setRejectionReason('');
                                            }}
                                            style={[styles.rejectCancelButton, { backgroundColor: theme.colors.surfaceHighest }]}
                                        >
                                            <Text style={[styles.rejectCancelText, { color: theme.colors.text }]}>Cancel</Text>
                                        </Pressable>

                                        <Pressable
                                            onPress={() => handleReject(selectedTask)}
                                            style={[
                                                styles.rejectConfirmButton,
                                                { backgroundColor: theme.colors.textDestructive },
                                                isRejectDisabled && { opacity: 0.5 }
                                            ]}
                                            disabled={isRejectDisabled}
                                        >
                                            <Text style={styles.rejectConfirmText}>Reject Task</Text>
                                        </Pressable>
                                    </View>
                                </View>
                            </View>
                        </Modal>
                    )}

                    {/* Processing Indicator */}
                    {isProcessing && (
                        <View style={styles.processingOverlay}>
                            <ActivityIndicator size="large" color={theme.colors.button.primary.background} />
                        </View>
                    )}
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create((theme) => ({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    container: {
        width: '90%',
        maxWidth: 600,
        maxHeight: '80%',
        borderRadius: 16,
        overflow: 'hidden',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 16,
        borderBottomWidth: 1,
    },
    title: {
        fontSize: 20,
        fontWeight: 'bold',
        ...Typography.default('semiBold'),
    },
    closeButton: {
        padding: 4,
    },
    content: {
        padding: 16,
    },
    emptyState: {
        alignItems: 'center',
        paddingVertical: 48,
    },
    emptyStateText: {
        marginTop: 16,
        fontSize: 16,
        ...Typography.default(),
    },
    approveAllButton: {
        padding: 16,
        borderRadius: 12,
        alignItems: 'center',
        marginBottom: 16,
    },
    approveAllButtonText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '600',
        ...Typography.default('semiBold'),
    },
    taskCard: {
        padding: 16,
        borderRadius: 12,
        borderWidth: 1,
        marginBottom: 12,
    },
    taskHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    taskTitle: {
        fontSize: 16,
        fontWeight: '600',
        flex: 1,
        ...Typography.default('semiBold'),
    },
    priorityBadge: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
        marginLeft: 8,
    },
    priorityUrgent: {
        backgroundColor: '#FEE2E2',
    },
    priorityHigh: {
        backgroundColor: '#FED7AA',
    },
    priorityMedium: {
        backgroundColor: '#FEF3C7',
    },
    priorityLow: {
        backgroundColor: '#E0E7FF',
    },
    priorityText: {
        fontSize: 12,
        fontWeight: '600',
        textTransform: 'uppercase',
    },
    taskDescription: {
        fontSize: 14,
        lineHeight: 20,
        marginBottom: 12,
        ...Typography.default(),
    },
    taskMeta: {
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: 'wrap',
        marginBottom: 12,
    },
    metaText: {
        fontSize: 12,
        marginRight: 12,
        ...Typography.default(),
    },
    aiBadge: {
        backgroundColor: '#E0E7FF',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
    },
    aiBadgeText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#4F46E5',
    },
    proposalRow: {
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: 'wrap',
        marginBottom: 10,
        gap: 4,
    },
    proposalSourceBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#E0E7FF',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
        gap: 4,
    },
    proposalSourceText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#4F46E5',
    },
    sectionLabel: {
        fontSize: 11,
        fontWeight: '600',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: 4,
    },
    impactRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 6,
        marginBottom: 12,
    },
    impactChip: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#E0E7FF',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 999,
        gap: 4,
    },
    impactChipText: {
        fontSize: 11,
        fontWeight: '500',
    },
    taskActions: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: 8,
    },
    actionButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 12,
        borderRadius: 8,
        gap: 6,
    },
    approveButton: {},
    rejectButton: {},
    actionButtonText: {
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: '600',
        ...Typography.default('semiBold'),
    },
    rejectModal: {
        width: '90%',
        maxWidth: 400,
        padding: 24,
        borderRadius: 16,
    },
    rejectTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 16,
        ...Typography.default('semiBold'),
    },
    rejectLabel: {
        fontSize: 14,
        fontWeight: '600',
        marginBottom: 8,
        ...Typography.default('semiBold'),
    },
    rejectInput: {
        borderWidth: 1,
        borderRadius: 8,
        padding: 12,
        fontSize: 14,
        minHeight: 100,
        textAlignVertical: 'top',
        marginBottom: 16,
        ...Typography.default(),
    },
    rejectActions: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: 12,
    },
    rejectCancelButton: {
        flex: 1,
        padding: 12,
        borderRadius: 8,
        alignItems: 'center',
    },
    rejectCancelText: {
        fontSize: 16,
        fontWeight: '600',
        ...Typography.default('semiBold'),
    },
    rejectConfirmButton: {
        flex: 1,
        padding: 12,
        borderRadius: 8,
        alignItems: 'center',
    },
    rejectConfirmText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '600',
        ...Typography.default('semiBold'),
    },
    processingOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'center',
        alignItems: 'center',
    },
}));
