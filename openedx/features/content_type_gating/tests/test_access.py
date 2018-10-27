"""
Test audit user's access to various content based on content-gating features.
"""

import ddt
from django.http import Http404
from django.test.utils import override_settings
from mock import Mock, patch

from courseware.access import has_access
from courseware.access_response import IncorrectPartitionGroupError
from course_modes.tests.factories import CourseModeFactory
from django.test.client import RequestFactory
from lms.djangoapps.courseware.module_render import load_single_xblock
from openedx.features.course_duration_limits.config import CONTENT_TYPE_GATING_FLAG
from openedx.core.djangoapps.waffle_utils.testutils import override_waffle_flag
from student.tests.factories import AdminFactory, CourseEnrollmentFactory, UserFactory
from xmodule.modulestore.tests.django_utils import ModuleStoreTestCase
from xmodule.modulestore.tests.factories import CourseFactory, ItemFactory


@override_settings(FIELD_OVERRIDE_PROVIDERS=(
                   'openedx.features.content_type_gating.field_override.ContentTypeGatingFieldOverride',))
@override_waffle_flag(CONTENT_TYPE_GATING_FLAG, True)
@ddt.ddt
class TestProblemTypeAccess(ModuleStoreTestCase):

    def setUp(self):
        super(TestProblemTypeAccess, self).setUp()
        self.course = CourseFactory.create(run='testcourse1', display_name='Test Course Title')
        audit_mode = CourseModeFactory.create(course_id=self.course.id, mode_slug='audit')
        verified_mode = CourseModeFactory.create(course_id=self.course.id, mode_slug='verified')
        self.audit_user = UserFactory.create()
        CourseEnrollmentFactory.create(user=self.audit_user, course_id=self.course.id, mode='audit')
        with self.store.bulk_operations(self.course.id):
            self.overview = ItemFactory.create(
                parent=self.course,
                display_name='Overview'
            )
            self.chapter_subsection = ItemFactory.create(
                parent=self.overview,
                category='sequential',
                display_name='Lesson 1'
            )
            self.chapter_vertical = ItemFactory.create(
                parent=self.chapter_subsection,
                category='vertical',
                display_name='Lesson 1 Vertical - Unit 1'
            )

    def is_block_gated(self, block, gated):
        fake_request = Mock()
        if gated:
            # check that has_access raised the IncorrectPartitionGroupError in order to gate the block
            with patch('courseware.access_response.IncorrectPartitionGroupError.__init__') as mock_access_error:
                mock_access_error.return_value = IncorrectPartitionGroupError
                with self.assertRaises(Http404):
                    block = load_single_xblock(fake_request, self.audit_user.id, unicode(self.course.id),
                                               unicode(block.scope_ids.usage_id), course=None)
                self.assertTrue(mock_access_error.called)
        else:
            # check that has_access did not raise the IncorrectPartitionGroupError thereby not gating the block
            with patch('courseware.access_response.IncorrectPartitionGroupError.__init__') as mock_access_error:
                mock_access_error.return_value = IncorrectPartitionGroupError
                block = load_single_xblock(fake_request, self.audit_user.id, unicode(self.course.id),
                                           unicode(block.scope_ids.usage_id), course=None)
                self.assertFalse(mock_access_error.called)

    @ddt.data(
        (False, False, 0, False),
        (False, True, 0, False),
        (False, False, 1, False),
        (False, True, 1, False),
        (True, False, 0, False),
        (True, True, 0, False),
        (True, False, 1, False),
        (True, True, 1, True),
    )
    @ddt.unpack
    def test_graded_score_weight_values(self, graded, has_score, weight, gated):
        # has_score is determined by XBlock type. It is not a value set on an instance of an XBlock
        if has_score:
            block = ItemFactory.create(
                parent=self.chapter_vertical,
                category='problem',
                display_name='Problem',
                graded=graded,
                weight=weight,
            )
        else:
            block = ItemFactory.create(
                parent=self.chapter_vertical,
                category='html',
                display_name='HTML',
                graded=graded,
                weight=weight,
            )
        self.is_block_gated(block, gated)
